const { Payment, PaymentSchedule, Order, Customer, User } = require('../models');

class PaymentController {
  async listPayments(req, res, next) {
    try {
      const { customerId, orderId } = req.query;
      const where = {};
      if (customerId) where.customerId = customerId;
      if (orderId) where.orderId = orderId;

      const payments = await Payment.findAll({
        where,
        order: [['paymentDate', 'DESC']],
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'companyName', 'customerCode'] },
          { model: Order, as: 'order', attributes: ['orderNumber', 'totalAmount'] },
          { model: User, as: 'recordedBy', attributes: ['fullName'] },
        ],
      });

      return res.json({ success: true, data: payments });
    } catch (error) {
      next(error);
    }
  }

  async listSchedules(req, res, next) {
    try {
      const { customerId, status } = req.query;
      const where = {};
      if (customerId) where.customerId = customerId;
      if (status) where.status = status;

      const schedules = await PaymentSchedule.findAll({
        where,
        order: [['dueDate', 'ASC']],
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'companyName', 'customerCode'] },
          { model: Order, as: 'order', attributes: ['orderNumber', 'totalAmount'] },
        ],
      });

      return res.json({ success: true, data: schedules });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaymentController();
