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
      const { status, notes } = req.body;
      if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });

      const order = await orderService.updateOrderStatus(id, status, notes);
      return res.json({
        success: true,
        message: `Order status updated to ${status}.`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async recordPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { amount, notes } = req.body;
      const order = await orderService.recordPayment(id, amount, notes);
      return res.json({
        success: true,
        message: `Payment of Rs. ${amount} recorded. New balance: Rs. ${order.balanceAmount}.`,
        data: order,
      });
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
        quantity: qty,
        subtotal: totalAmount,
        discount: 0,
        totalAmount: totalAmount,
        advancePaid: 0,
        specifications: specifications || null,
        status: 'RECEIVED',
        notes: `[Online Web Order via WhatsApp Contact: ${cPhone || 'N/A'}]\nCustomer Name: ${cName}\nRequested Item: ${title} (${qty} qty @ Rs. ${price.toFixed(2)})\nInstructions: ${notes || specifications || 'None'}`,
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
}

module.exports = new OrderController();
