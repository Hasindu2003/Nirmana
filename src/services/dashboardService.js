const { Op } = require('sequelize');
const { Order, Customer, StockItem, StockTransaction, PosSale, PosSaleItem, User } = require('../models');
const { getSriLankaTodayString, getSriLankaDayBounds, formatSriLankaDate } = require('../utils/dateUtils');

class DashboardService {
  async getDashboardStats(selectedDate = null) {
    const today = getSriLankaTodayString();
    const targetDateStr = selectedDate || today;
    const { startOfDay, endOfDay } = getSriLankaDayBounds(new Date(targetDateStr));

    // Execute all dashboard count and list queries in PARALLEL
    const [
      activeOrdersCount,
      completedOrdersCount,
      todayOrdersCount,
      allStockItems,
      recentOrders,
      recentTransactions,
      todayPosSales,
      todayOrders,
      todayOfficeUseTransactions,
      todayStockInTransactions,
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
        where: { orderDate: targetDateStr },
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
        limit: 8,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: StockItem,
            as: 'stockItem',
            attributes: ['name', 'unit', 'code', 'unitCost'],
          },
        ],
      }),
      // POS Sales & Counter Transactions for the day
      PosSale.findAll({
        where: {
          createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
          status: { [Op.ne]: 'VOIDED' },
        },
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'phone'],
          },
          {
            model: PosSaleItem,
            as: 'items',
            attributes: ['id', 'itemName', 'quantity', 'unitPrice', 'totalPrice', 'unit'],
          },
          {
            model: User,
            as: 'cashier',
            attributes: ['id', 'fullName', 'username', 'role'],
          },
        ],
      }),
      // Orders placed / received today
      Order.findAll({
        where: {
          [Op.or]: [
            { orderDate: targetDateStr },
            { createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay } },
          ],
        },
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'phone', 'companyName'],
          },
        ],
      }),
      // Office Use deductions today
      StockTransaction.findAll({
        where: {
          type: 'OUT',
          category: 'OFFICE_USE',
          [Op.or]: [
            { date: targetDateStr },
            { createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay } },
          ],
        },
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: StockItem,
            as: 'stockItem',
            attributes: ['id', 'name', 'code', 'unit', 'unitCost'],
          },
        ],
      }),
      // Stock In (purchases/restock) today
      StockTransaction.findAll({
        where: {
          type: 'IN',
          [Op.or]: [
            { date: targetDateStr },
            { createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay } },
          ],
        },
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: StockItem,
            as: 'stockItem',
            attributes: ['id', 'name', 'code', 'unit', 'unitCost'],
          },
        ],
      }),
    ]);

    const lowStockItems = allStockItems.filter(item => {
      return parseFloat(item.currentStock) <= parseFloat(item.minStockAlert);
    });

    // Compute Daily Financial Metrics for End-of-Day
    let posTotalRevenue = 0;
    let posCashTotal = 0;
    let posCardTotal = 0;
    let posBankTransferTotal = 0;

    todayPosSales.forEach(sale => {
      const amt = parseFloat(sale.totalAmount) || 0;
      posTotalRevenue += amt;
      if (sale.paymentMethod === 'CASH') posCashTotal += amt;
      else if (sale.paymentMethod === 'CARD') posCardTotal += amt;
      else posBankTransferTotal += amt;
    });

    let ordersTotalValue = 0;
    let ordersAdvanceCollected = 0;
    let ordersBalanceDue = 0;

    todayOrders.forEach(ord => {
      ordersTotalValue += parseFloat(ord.totalAmount) || 0;
      ordersAdvanceCollected += parseFloat(ord.advancePaid) || 0;
      ordersBalanceDue += parseFloat(ord.balanceAmount) || 0;
    });

    let officeUseTotalCost = 0;
    let officeUseTotalQty = 0;
    todayOfficeUseTransactions.forEach(tx => {
      const cost = parseFloat(tx.totalCost) || (parseFloat(tx.quantity) * (parseFloat(tx.unitCost) || 0));
      officeUseTotalCost += cost;
      officeUseTotalQty += parseFloat(tx.quantity) || 0;
    });

    let stockInTotalCost = 0;
    let stockInTotalQty = 0;
    todayStockInTransactions.forEach(tx => {
      const cost = parseFloat(tx.totalCost) || (parseFloat(tx.quantity) * (parseFloat(tx.unitCost) || 0));
      stockInTotalCost += cost;
      stockInTotalQty += parseFloat(tx.quantity) || 0;
    });

    // Total actual money/cash received today (POS sales + order advances)
    const totalCollectedToday = posTotalRevenue + ordersAdvanceCollected;
    // Total gross sales booked today
    const totalBusinessBookedToday = posTotalRevenue + ordersTotalValue;
    // Net operating balance (Cash inflow - Office consumable overhead expense)
    const netOperatingBalance = totalCollectedToday - officeUseTotalCost;

    const dailyBusiness = {
      date: targetDateStr,
      formattedDate: formatSriLankaDate(targetDateStr),
      isToday: targetDateStr === today,
      // Revenue / Collections
      posTotalRevenue: parseFloat(posTotalRevenue.toFixed(2)),
      posSalesCount: todayPosSales.length,
      posCashTotal: parseFloat(posCashTotal.toFixed(2)),
      posCardTotal: parseFloat(posCardTotal.toFixed(2)),
      posBankTransferTotal: parseFloat(posBankTransferTotal.toFixed(2)),
      ordersTotalValue: parseFloat(ordersTotalValue.toFixed(2)),
      ordersAdvanceCollected: parseFloat(ordersAdvanceCollected.toFixed(2)),
      ordersBalanceDue: parseFloat(ordersBalanceDue.toFixed(2)),
      ordersCount: todayOrders.length,
      totalCollectedToday: parseFloat(totalCollectedToday.toFixed(2)),
      totalBusinessBookedToday: parseFloat(totalBusinessBookedToday.toFixed(2)),
      // Office Use Expense
      officeUseTotalCost: parseFloat(officeUseTotalCost.toFixed(2)),
      officeUseTotalQty,
      officeUseCount: todayOfficeUseTransactions.length,
      // Restocking
      stockInTotalCost: parseFloat(stockInTotalCost.toFixed(2)),
      stockInTotalQty,
      stockInCount: todayStockInTransactions.length,
      // Net figures
      netOperatingBalance: parseFloat(netOperatingBalance.toFixed(2)),
      // Detailed arrays for Day-End Ledger display
      todayPosSales,
      todayOrders,
      todayOfficeUseTransactions,
      todayStockInTransactions,
    };

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
      dailyBusiness,
    };
  }
}

module.exports = new DashboardService();
