const { Op } = require('sequelize');
const { sequelize, Order, Customer, Payment } = require('../models');
const { getSriLankaTodayString } = require('../utils/dateUtils');

const { buildPagination } = require('../utils/pagination');

class OrderService {
  async generateOrderNumber(transaction = null) {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;
    const count = await Order.count({ transaction });
    let seq = count + 1;
    let candidate = `${prefix}${seq.toString().padStart(4, '0')}`;

    while (await Order.findOne({ where: { orderNumber: candidate }, transaction })) {
      seq++;
      candidate = `${prefix}${seq.toString().padStart(4, '0')}`;
    }
    return candidate;
  }

  async getAllOrders({ status, search, customerId, page = 1, limit = 10, paginate = true } = {}) {
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { orderNumber: { [Op.like]: q } },
        { jobTitle: { [Op.like]: q } },
        { paperMaterial: { [Op.like]: q } },
        { notes: { [Op.like]: q } },
      ];
    }

    const queryOptions = {
      where,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'phone', 'companyName', 'email', 'customerCode'],
        },
      ],
      distinct: true,
    };

    if (!paginate) {
      return await Order.findAll(queryOptions);
    }

    queryOptions.limit = parseInt(limit, 10) || 10;
    queryOptions.offset = ((parseInt(page, 10) || 1) - 1) * queryOptions.limit;

    const { count: totalCount, rows: orders } = await Order.findAndCountAll(queryOptions);
    const pagination = buildPagination(totalCount, page, limit);

    return {
      orders,
      pagination,
    };
  }

  async getOrderById(id) {
    const order = await Order.findByPk(id, {
      include: [
        {
          model: Customer,
          as: 'customer',
        },
      ],
    });
    if (!order) throw new Error('Order not found.');
    return order;
  }

  async createOrder(data) {
    return await sequelize.transaction(async (t) => {
      let customerId = data.customerId;

      // Check if user is creating an inline new customer
      if (!customerId && (data.newCustomerName || data.name)) {
        const custName = (data.newCustomerName || data.name).trim();
        const custPhone = (data.newCustomerPhone || data.phone || '').trim();

        if (!custName) {
          throw new Error('Customer name is required when adding a new customer.');
        }
        if (!custPhone) {
          throw new Error('Customer phone number is required when adding a new customer.');
        }
        if (!/^0\d{9}$/.test(custPhone)) {
          throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
        }

        // Check if an existing customer with this phone number already exists to prevent duplicates
        let existingCustomer = await Customer.findOne({
          where: { phone: custPhone },
          transaction: t,
        });

        if (existingCustomer) {
          customerId = existingCustomer.id;
          if (!existingCustomer.email && (data.newCustomerEmail || data.email)) {
            existingCustomer.email = data.newCustomerEmail || data.email;
          }
          if (!existingCustomer.companyName && (data.newCustomerCompany || data.companyName)) {
            existingCustomer.companyName = data.newCustomerCompany || data.companyName;
          }
          await existingCustomer.save({ transaction: t });
        } else {
          // Auto generate customer code
          const custCount = await Customer.count({ transaction: t });
          let custSeq = custCount + 1;
          let customerCode = `CUST-${custSeq.toString().padStart(4, '0')}`;
          while (await Customer.findOne({ where: { customerCode }, transaction: t })) {
            custSeq++;
            customerCode = `CUST-${custSeq.toString().padStart(4, '0')}`;
          }

          const newCustomer = await Customer.create({
            customerCode,
            name: custName,
            phone: custPhone,
            email: (data.newCustomerEmail || data.email || null),
            companyName: (data.newCustomerCompany || data.companyName || null),
            address: (data.newCustomerAddress || data.address || null),
            notes: 'Created automatically during new order intake',
          }, { transaction: t });

          customerId = newCustomer.id;
        }
      }

      let customer = null;
      if (customerId) {
        customer = await Customer.findByPk(customerId, { transaction: t });
      }

      const orderNumber = data.orderNumber || (await this.generateOrderNumber(t));

      const qty = parseInt(data.quantity, 10) || 1;
      const subtotal = parseFloat(data.subtotal) || parseFloat(data.totalAmount) || 0.00;
      const discount = parseFloat(data.discount) || 0.00;
      const discountType = data.discountType || 'FIXED';
      const total = Math.max(0, subtotal - discount);
      const advance = parseFloat(data.advancePaid) || 0.00;
      const balance = Math.max(0, total - advance);

      const order = await Order.create({
        orderNumber,
        customerId: customer ? customer.id : null,
        orderDate: data.orderDate || getSriLankaTodayString(),
        dueDate: data.dueDate || null,
        jobTitle: data.jobTitle || 'Print Job Order',
        paperMaterial: data.paperMaterial || null,
        specifications: data.specifications || null,
        quantity: qty,
        subtotal: subtotal,
        discount: discount,
        discountType: discountType,
        totalAmount: total,
        advancePaid: advance,
        balanceAmount: balance,
        status: data.status || 'RECEIVED',
        notes: data.notes || null,
      }, { transaction: t });

      // Automatically record initial advance deposit in Payment ledger if advance was collected
      if (advance > 0) {
        try {
          const payCount = await Payment.count({ transaction: t });
          const paymentNumber = `PAY-${new Date().getFullYear()}-${(payCount + 1).toString().padStart(4, '0')}`;
          await Payment.create({
            paymentNumber,
            orderId: order.id,
            customerId: customer ? customer.id : null,
            amount: advance,
            paymentMethod: data.paymentMethod || 'CASH',
            paymentDate: data.orderDate || getSriLankaTodayString(),
            notes: `Advance deposit for order ${order.orderNumber}`,
          }, { transaction: t });
        } catch (payErr) {
          console.warn('Could not record initial payment row:', payErr.message);
        }
      }

      return order;
    });
  }

  async updateOrderStatus(id, newStatus, notes, paymentOptions = {}) {
    const order = await Order.findByPk(id, {
      include: [{ model: Customer, as: 'customer' }],
    });
    if (!order) throw new Error('Order not found.');

    const oldStatus = order.status;
    order.status = newStatus;

    let paymentRecorded = 0;
    // When marking order as COMPLETED, handle settlement of balance
    if (newStatus === 'COMPLETED') {
      const balance = parseFloat(order.balanceAmount) || 0;
      if (paymentOptions.collectFullBalance && balance > 0) {
        paymentRecorded = balance;
        order.advancePaid = (parseFloat(order.advancePaid) || 0) + balance;
        order.balanceAmount = 0.00;
      } else if (paymentOptions.paymentAmount && parseFloat(paymentOptions.paymentAmount) > 0) {
        const amt = Math.min(balance, parseFloat(paymentOptions.paymentAmount));
        paymentRecorded = amt;
        order.advancePaid = (parseFloat(order.advancePaid) || 0) + amt;
        order.balanceAmount = Math.max(0, balance - amt);
      }
    }

    let noteText = `[${newStatus}]`;
    if (paymentRecorded > 0) {
      noteText += `: Job completed & collected payment of Rs. ${paymentRecorded.toFixed(2)} (Balance: Rs. ${parseFloat(order.balanceAmount).toFixed(2)})`;
    } else if (newStatus === 'COMPLETED' && parseFloat(order.balanceAmount) > 0) {
      noteText += `: Job completed & delivered on credit (Balance of Rs. ${parseFloat(order.balanceAmount).toFixed(2)} remaining due)`;
    } else if (newStatus === 'COMPLETED' && parseFloat(order.balanceAmount) <= 0) {
      noteText += `: Job completed & delivered (Paid in full)`;
    }
    if (notes) {
      noteText += ` - ${notes}`;
    }

    order.notes = order.notes ? `${order.notes}\n${noteText}` : noteText;
    await order.save();

    if (paymentRecorded > 0) {
      try {
        const payCount = await Payment.count();
        const paymentNumber = `PAY-${new Date().getFullYear()}-${(payCount + 1).toString().padStart(4, '0')}`;
        await Payment.create({
          paymentNumber,
          orderId: order.id,
          customerId: order.customerId,
          amount: paymentRecorded,
          paymentMethod: paymentOptions.paymentMethod || 'CASH',
          paymentDate: getSriLankaTodayString(),
          notes: notes || `Payment recorded on order completion (${order.orderNumber})`,
          recordedById: paymentOptions.recordedById || null,
        });
      } catch (payErr) {
        console.warn('Could not record Payment row on updateOrderStatus:', payErr.message);
      }
    }

    return { order, paymentRecorded };
  }

  async recordPayment(id, paymentAmount, notes, paymentOptions = {}) {
    const order = await Order.findByPk(id);
    if (!order) throw new Error('Order not found.');

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) throw new Error('Payment amount must be greater than zero.');

    const currentGiven = parseFloat(order.advancePaid) || 0;
    const currentBalance = parseFloat(order.balanceAmount) || 0;

    order.advancePaid = currentGiven + amt;
    order.balanceAmount = Math.max(0, currentBalance - amt);
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n[Payment +Rs.${amt.toFixed(2)}]: ${notes}` : `[Payment +Rs.${amt.toFixed(2)}]: ${notes}`;
    }
    await order.save();

    try {
      const payCount = await Payment.count();
      const paymentNumber = `PAY-${new Date().getFullYear()}-${(payCount + 1).toString().padStart(4, '0')}`;
      await Payment.create({
        paymentNumber,
        orderId: order.id,
        customerId: order.customerId,
        amount: amt,
        paymentMethod: paymentOptions.paymentMethod || 'CASH',
        paymentDate: getSriLankaTodayString(),
        notes: notes || `Payment recorded for order ${order.orderNumber}`,
        recordedById: paymentOptions.recordedById || null,
      });
    } catch (payErr) {
      console.warn('Could not record Payment row on recordPayment:', payErr.message);
    }

    return order;
  }

  async updateOrderDiscount(id, manualDiscount) {
    const order = await Order.findByPk(id);
    if (!order) throw new Error('Order not found.');

    const disc = Math.max(0, parseFloat(manualDiscount) || 0);
    const sub = parseFloat(order.subtotal) || parseFloat(order.totalAmount) || 0;
    const given = parseFloat(order.advancePaid) || 0;

    order.discount = disc;
    order.totalAmount = Math.max(0, sub - disc);
    order.balanceAmount = Math.max(0, order.totalAmount - given);
    await order.save();

    return order;
  }

  async trackOrderOrToken(code) {
    if (!code || !code.trim()) throw new Error('Tracking code or phone number is required.');
    const q = code.trim();
    const { QuickPrintJob, QuickPrintFile } = require('../models');

    // 1. Search in Order by orderNumber
    let order = await Order.findOne({
      where: { orderNumber: q },
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] }],
    });

    if (!order) {
      // Try search by customer phone if 10-digit number
      if (/^0\d{9}$/.test(q)) {
        const cust = await Customer.findOne({ where: { phone: q } });
        if (cust) {
          order = await Order.findOne({
            where: { customerId: cust.id },
            order: [['createdAt', 'DESC']],
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] }],
          });
        }
      }
    }

    if (order) {
      return {
        type: 'ORDER',
        orderNumber: order.orderNumber,
        status: order.status,
        jobTitle: order.jobTitle,
        paperMaterial: order.paperMaterial,
        quantity: order.quantity,
        totalAmount: parseFloat(order.totalAmount || 0),
        advancePaid: parseFloat(order.advancePaid || 0),
        balanceAmount: parseFloat(order.balanceAmount || 0),
        orderDate: order.orderDate,
        dueDate: order.dueDate,
        specifications: order.specifications,
        customerName: order.customer ? order.customer.name : 'Customer',
      };
    }

    // 2. Search in QuickPrintJob by tokenNumber (e.g. QP-1001 or 1001)
    let tokenCandidate = q;
    if (tokenCandidate.startsWith('#')) tokenCandidate = tokenCandidate.substring(1);
    const qpJob = await QuickPrintJob.findOne({
      where: {
        [Op.or]: [
          { tokenNumber: tokenCandidate },
          { tokenNumber: `QP-${tokenCandidate}` },
        ],
      },
      include: [{ model: QuickPrintFile, as: 'files' }],
    });

    if (qpJob) {
      return {
        type: 'QUICK_PRINT',
        tokenNumber: qpJob.tokenNumber,
        status: qpJob.status,
        customerName: qpJob.customerName || 'Walk-in Customer',
        customerPhone: qpJob.customerPhone,
        fileCount: qpJob.files ? qpJob.files.length : 0,
        files: (qpJob.files || []).map(f => ({ originalName: f.originalName, pageCount: f.pageCount, colorMode: f.colorMode })),
        notes: qpJob.notes,
        createdAt: qpJob.createdAt,
      };
    }

    return null;
  }

  /**
   * Customer edits their own order request before printing begins.
   * Locked if status is PRINTING, READY, COMPLETED, or CANCELLED.
   */
  async customerEditOrder(orderId, customerId, { specifications, quantity }) {
    const order = await Order.findByPk(orderId);
    if (!order) throw new Error('Order not found.');

    if (customerId && order.customerId && order.customerId !== customerId) {
      throw new Error('Access denied: You can only edit your own orders.');
    }

    if (order.status !== 'RECEIVED') {
      throw new Error(`Production has already commenced (${order.status}). Online editing is locked. Please contact our print shop counter directly.`);
    }

    const changes = [];

    if (typeof specifications !== 'undefined' && specifications !== null) {
      order.specifications = specifications.trim();
      changes.push('Specifications updated');
    }

    if (quantity && parseInt(quantity, 10) > 0) {
      const newQty = parseInt(quantity, 10);
      if (newQty !== order.quantity) {
        const oldQty = Math.max(1, order.quantity || 1);
        const currentSubtotal = parseFloat(order.subtotal) || parseFloat(order.totalAmount) || 0;
        const unitPrice = currentSubtotal / oldQty;
        const newSubtotal = parseFloat((unitPrice * newQty).toFixed(2));
        const discount = parseFloat(order.discount) || 0;
        const newTotal = Math.max(0, parseFloat((newSubtotal - discount).toFixed(2)));
        const advance = parseFloat(order.advancePaid) || 0;
        const newBalance = Math.max(0, parseFloat((newTotal - advance).toFixed(2)));

        changes.push(`Quantity changed from ${order.quantity} to ${newQty} (New Total: Rs. ${newTotal})`);
        order.quantity = newQty;
        order.subtotal = newSubtotal;
        order.totalAmount = newTotal;
        order.balanceAmount = newBalance;
      }
    }

    const auditStr = `\n[Customer Edit on ${new Date().toLocaleString('en-LK')}]: ${changes.join(', ')}`;
    order.notes = (order.notes || '') + auditStr;

    await order.save();
    return order;
  }

  /**
   * Customer uploads a bank transfer payment receipt / slip.
   */
  async uploadPaymentSlip(orderId, customerId, { slipUrl, amount, ref, notes }) {
    const order = await Order.findByPk(orderId);
    if (!order) throw new Error('Order not found.');

    if (customerId && order.customerId && order.customerId !== customerId) {
      throw new Error('Access denied: You can only upload slips to your own orders.');
    }

    order.paymentSlipUrl = slipUrl;
    order.paymentSlipStatus = 'PENDING_VERIFICATION';
    order.paymentSlipUploadedAt = new Date();
    order.paymentSlipAmount = amount ? parseFloat(amount) : parseFloat(order.balanceAmount);
    order.paymentSlipRef = ref ? ref.trim() : null;
    order.paymentSlipNotes = notes ? notes.trim() : null;

    const auditStr = `\n[Bank Slip Uploaded on ${new Date().toLocaleString('en-LK')}]: Claimed Amount: Rs. ${order.paymentSlipAmount}, Ref: ${order.paymentSlipRef || 'N/A'}`;
    order.notes = (order.notes || '') + auditStr;

    await order.save();
    return order;
  }

  /**
   * Staff/Owner reviews and verifies or rejects the bank payment slip.
   */
  async verifyPaymentSlip(orderId, { action, verifiedAmount, notes, verifiedById }) {
    const order = await Order.findByPk(orderId);
    if (!order) throw new Error('Order not found.');

    if (action === 'VERIFY') {
      const amt = verifiedAmount ? parseFloat(verifiedAmount) : (parseFloat(order.paymentSlipAmount) || parseFloat(order.balanceAmount));
      if (amt > 0) {
        await this.recordPayment(
          order.id,
          amt,
          `Online Bank Transfer Verified (Ref: ${order.paymentSlipRef || 'N/A'}). ${notes || ''}`,
          {
            paymentMethod: 'BANK_TRANSFER',
            recordedById: verifiedById,
          }
        );
      }
      order.paymentSlipStatus = 'VERIFIED';
      await order.save();
      return { order: await Order.findByPk(orderId), verified: true, amount: amt };
    } else if (action === 'REJECT') {
      order.paymentSlipStatus = 'REJECTED';
      const rejectNote = `\n[Bank Slip REJECTED on ${new Date().toLocaleString('en-LK')} by Staff]: ${notes || 'Slip illegible or funds not received'}`;
      order.notes = (order.notes || '') + rejectNote;
      await order.save();
      return { order, verified: false, reason: notes };
    } else {
      throw new Error('Invalid verification action. Must be VERIFY or REJECT.');
    }
  }
}

module.exports = new OrderService();
