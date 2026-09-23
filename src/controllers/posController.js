const posService = require('../services/posService');

class PosController {
  async createSale(req, res, next) {
    try {
      const cashierId = req.user ? req.user.id : null;
      const sale = await posService.createSale(req.body, cashierId);
      return res.status(201).json({
        success: true,
        message: `Sale #${sale.receiptNumber} completed successfully.`,
        data: sale,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async listSales(req, res, next) {
    try {
      const { search, dateFrom, dateTo, paymentMethod, status, page, limit } = req.query;
      const result = await posService.getAllSales({
        search,
        dateFrom,
        dateTo,
        paymentMethod,
        status,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        paginate: true,
      });

      return res.json({
        success: true,
        data: result.sales,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSale(req, res, next) {
    try {
      const { id } = req.params;
      const sale = await posService.getSaleById(id);
      return res.json({
        success: true,
        data: sale,
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
  }

  async voidSale(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : null;
      const result = await posService.voidSale(id, userId);
      return res.json({
        success: true,
        message: result.message,
        data: result.sale,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async getStats(req, res, next) {
    try {
      const stats = await posService.getDailyStats();
      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PosController();
