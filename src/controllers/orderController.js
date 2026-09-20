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
      const { amount } = req.body;
      const order = await orderService.recordPayment(id, amount);
      return res.json({
        success: true,
        message: `Payment of Rs. ${amount} recorded. New balance: Rs. ${order.balanceAmount}.`,
        data: order,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new OrderController();
