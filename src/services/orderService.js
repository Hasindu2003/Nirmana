const { Op } = require('sequelize');
const { sequelize, Order, Customer } = require('../models');
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

      if (!customerId) {
        throw new Error('Please select an existing customer or enter new customer details.');
      }

      // Verify customer exists
      const customer = await Customer.findByPk(customerId, { transaction: t });
      if (!customer) throw new Error('Customer not found.');

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
        customerId: customer.id,
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

      return order;
    });
  }

  async updateOrderStatus(id, newStatus, notes) {
    const order = await Order.findByPk(id);
    if (!order) throw new Error('Order not found.');

    order.status = newStatus;
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n[${newStatus}]: ${notes}` : `[${newStatus}]: ${notes}`;
    }
    await order.save();
    return order;
  }

  async recordPayment(id, paymentAmount, notes) {
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
}

module.exports = new OrderService();
