const { Op } = require('sequelize');
const { Order, Customer, StockItem, StockTransaction } = require('../models');
const { getSriLankaTodayString } = require('../utils/dateUtils');

class DashboardService {
  async getDashboardStats() {
    const today = getSriLankaTodayString();

    // Execute all dashboard count and list queries in PARALLEL
    const [
      activeOrdersCount,
      completedOrdersCount,
      todayOrdersCount,
      allStockItems,
      recentOrders,
      recentTransactions,
    ] = await Promise.all([
      Order.count({
        where: {
          status: { [Op.in]: ['RECEIVED', 'PRINTING', 'READY'] },
        },
      }),
      Order.count({
        where: { status: 'COMPLETED' },
      }),
      Order.count({
        where: { orderDate: today },
      }),
      StockItem.findAll({
        where: { isActive: true },
        order: [['currentStock', 'ASC']],
      }),
      Order.findAll({
        limit: 6,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'phone', 'companyName'],
          },
        ],
      }),
      StockTransaction.findAll({
        limit: 6,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: StockItem,
            as: 'stockItem',
            attributes: ['name', 'unit', 'code'],
          },
        ],
      }),
    ]);

    const lowStockItems = allStockItems.filter(item => {
      return parseFloat(item.currentStock) <= parseFloat(item.minStockAlert);
    });

    return {
      kpis: {
        activeOrdersCount,
        completedOrdersCount,
        todayOrdersCount,
        lowStockCount: lowStockItems.length,
        totalStockItems: allStockItems.length,
      },
      lowStockItems,
      allStockItems,
      recentOrders,
      recentTransactions,
    };
  }
}

module.exports = new DashboardService();
