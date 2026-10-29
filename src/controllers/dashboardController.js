const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getStats(req, res, next) {
    try {
      const { date } = req.query;
      const stats = await dashboardService.getDashboardStats(date);
      return res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
