const { Op } = require('sequelize');
const { Order, Customer, StockItem, StockTransaction } = require('../models');

class DashboardService {
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];

    // 1. Orders counts
    const activeOrdersCount = await Order.count({
      where: {
        status: { [Op.in]: ['RECEIVED', 'PRINTING', 'READY'] },
      },
    });

    const completedOrdersCount = await Order.count({
      where: { status: 'COMPLETED' },
    });

    const todayOrdersCount = await Order.count({
      where: { orderDate: today },
    });

    // 2. Stock Health
    const allStockItems = await StockItem.findAll({
      where: { isActive: true },
      order: [['currentStock', 'ASC']],
    });

    const lowStockItems = allStockItems.filter(item => {
      return parseFloat(item.currentStock) <= parseFloat(item.minStockAlert);
    });

    // 3. Recent Orders
    const recentOrders = await Order.findAll({
      limit: 6,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'phone', 'companyName'],
        },
      ],
    });

    // 4. Recent Stock Transactions
    const recentTransactions = await StockTransaction.findAll({
      limit: 6,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: StockItem,
          as: 'stockItem',
          attributes: ['name', 'unit', 'code'],
        },
      ],
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
