const orderService = require('../services/orderService');

class OrderController {
  async listOrders(req, res, next) {
    try {
      const { status, search, customerId, page, limit } = req.query;
      const result = await orderService.getAllOrders({
        status,
        search,
        customerId,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        paginate: page || limit ? true : false,
      });

      if (result && result.pagination) {
        return res.json({ success: true, data: result.orders, pagination: result.pagination });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getOrder(req, res, next) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id);
      return res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req, res, next) {
    try {
      const order = await orderService.createOrder(req.body);
      return res.status(201).json({
        success: true,
        message: `Order ${order.orderNumber} created successfully!`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, notes, collectFullBalance, paymentAmount, paymentMethod } = req.body;
      if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });

      const result = await orderService.updateOrderStatus(id, status, notes, {
        collectFullBalance: Boolean(collectFullBalance),
        paymentAmount: paymentAmount ? parseFloat(paymentAmount) : 0,
        paymentMethod: paymentMethod || 'CASH',
        recordedById: req.user ? req.user.id : null,
      });

      const order = result.order || result;
      let msg = `Order status updated to ${status}.`;
      if (result.paymentRecorded > 0) {
        msg += ` Payment of Rs. ${result.paymentRecorded.toFixed(2)} recorded. Balance is now Rs. ${parseFloat(order.balanceAmount).toFixed(2)}.`;
      }

      return res.json({
        success: true,
        message: msg,
        data: order,
        paymentRecorded: result.paymentRecorded,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async recordPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { amount, notes, paymentMethod } = req.body;
      const order = await orderService.recordPayment(id, amount, notes, {
        paymentMethod: paymentMethod || 'CASH',
        recordedById: req.user ? req.user.id : null,
      });
      return res.json({
        success: true,
        message: `Payment of Rs. ${amount} recorded. New balance: Rs. ${order.balanceAmount}.`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async trackOrder(req, res, next) {
    try {
      const { code } = req.params;
      const result = await orderService.trackOrderOrToken(code);
      if (!result) {
        return res.status(404).json({ success: false, message: `No active order or quick print job found matching '${code}'. Please verify the tracking code or phone number.` });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateDiscount(req, res, next) {
    try {
      const { id } = req.params;
      const { discount } = req.body;
      const order = await orderService.updateOrderDiscount(id, discount);
      return res.json({
        success: true,
        message: `Manual discount updated to Rs. ${order.discount}. Total: Rs. ${order.totalAmount}, Balance: Rs. ${order.balanceAmount}.`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Public Online Order Intake
   * For guests: requires Name + WhatsApp Number (10 digits starting with 0)
   * For signed-in customers: links directly to their customer account
   */
  async createGuestOnlineOrder(req, res, next) {
    try {
      const {
        customerName,
        name,
        whatsappNumber,
        phone,
        productName,
        jobTitle,
        productType,
        category,
        paperMaterial,
        material,
        dimensions,
        sizeLabel,
        quantity,
        unitPrice,
        specifications,
        notes,
        email,
      } = req.body;

      const cName = (customerName || name || (req.user ? (req.user.fullName || req.user.username) : '')).trim();
      const cPhone = (whatsappNumber || phone || (req.user ? req.user.phone : '') || '').trim();
      const title = (productName || jobTitle || 'Online Product Order').trim();
      const qty = Math.max(1, parseInt(quantity, 10) || 1);
      const price = Math.max(0, parseFloat(unitPrice) || 0);
      const totalAmount = parseFloat((qty * price).toFixed(2));

      // Extract accurate physical substrate / material / good description
      const materialDesc = (paperMaterial || material || sizeLabel || dimensions || (category ? `${category} Material` : 'Custom Merchandise')).trim();

      // Validation
      if (!cName) {
        return res.status(400).json({ success: false, message: 'Please enter your name.' });
      }

      // If user is not logged in, WhatsApp number is strictly mandatory
      if (!req.user || !req.user.id) {
        if (!cPhone) {
          return res.status(400).json({
            success: false,
            message: 'WhatsApp number is required for online orders so our team can confirm your order specifications.',
          });
        }
        if (!/^0\d{9}$/.test(cPhone)) {
          return res.status(400).json({
            success: false,
            message: 'WhatsApp number must be exactly 10 digits starting with 0 (e.g. 0771234567).',
          });
        }
      }

      // Determine customer link
      let customerId = null;
      if (req.user && req.user.customerId) {
        customerId = req.user.customerId;
      }

      const orderPayload = {
        customerId,
        newCustomerName: cName,
        newCustomerPhone: cPhone,
        newCustomerEmail: email || (req.user ? req.user.email : null),
        jobTitle: title,
        paperMaterial: materialDesc,
        quantity: qty,
        subtotal: totalAmount,
        discount: 0,
        totalAmount: totalAmount,
        advancePaid: 0,
        specifications: specifications || null,
        status: 'RECEIVED',
        notes: `[Online Order: ${category || productType || 'Good'}]\nItem: ${title}\nMaterial / Substrate: ${materialDesc}\nCustomer: ${cName} (Phone: ${cPhone || 'N/A'})\nCustom Instructions: ${specifications || 'Standard'}`,
      };

      const order = await orderService.createOrder(orderPayload);

      return res.status(201).json({
        success: true,
        message: `Your online order #${order.orderNumber} has been received! Our store team will contact you via WhatsApp (${cPhone}) to confirm.`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Customer edits their order request (specs, quantity) strictly before PRINTING starts.
   */
  async customerEditOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { specifications, quantity } = req.body;
      const customerId = req.user ? req.user.customerId : null;

      const updated = await orderService.customerEditOrder(id, customerId, { specifications, quantity });
      return res.json({
        success: true,
        message: `Order #${updated.orderNumber} updated successfully.`,
        data: updated,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Customer uploads bank payment slip image/PDF.
   */
  async uploadPaymentSlip(req, res, next) {
    try {
      const { id } = req.params;
      const { amount, refNumber, notes } = req.body;
      const customerId = req.user ? req.user.customerId : null;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please select an image or PDF of your payment slip.' });
      }

      const slipUrl = `/uploads/slips/${req.file.filename}`;
      const updated = await orderService.uploadPaymentSlip(id, customerId, {
        slipUrl,
        amount,
        ref: refNumber,
        notes,
      });

      return res.json({
        success: true,
        message: `Payment slip for order #${updated.orderNumber} uploaded successfully! Our staff will verify and confirm your payment.`,
        data: updated,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Staff/Admin verifies or rejects bank payment slip.
   */
  async verifyPaymentSlip(req, res, next) {
    try {
      const { id } = req.params;
      const { action, verifiedAmount, notes } = req.body;
      const verifiedById = req.user ? req.user.id : null;

      if (!action || !['VERIFY', 'REJECT'].includes(action.toUpperCase())) {
        return res.status(400).json({ success: false, message: "Action must be 'VERIFY' or 'REJECT'." });
      }

      const result = await orderService.verifyPaymentSlip(id, {
        action: action.toUpperCase(),
        verifiedAmount,
        notes,
        verifiedById,
      });

      const msg = action.toUpperCase() === 'VERIFY'
        ? `Bank transfer payment of Rs. ${(result.amount || 0).toFixed(2)} verified and credited to order #${result.order.orderNumber}.`
        : `Bank slip for order #${result.order.orderNumber} rejected. Customer will be notified to re-upload.`;

      return res.json({
        success: true,
        message: msg,
        data: result.order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new OrderController();
