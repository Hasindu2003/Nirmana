const { Op } = require('sequelize');
const {
  sequelize,
  PosSale,
  PosSaleItem,
  StockItem,
  StockTransaction,
  Customer,
  User,
} = require('../models');
const {
  getSriLankaTodayString,
  getSriLankaDayBounds,
} = require('../utils/dateUtils');
const { buildPagination } = require('../utils/pagination');

class PosService {
  /**
   * Generates a clean, sequential daily receipt number:
   * Format: POS-YYMMDD-XXXX (e.g. POS-260923-0001)
   */
  async generateReceiptNumber(transaction = null) {
    const now = new Date();
    const { startOfDay, endOfDay, dateStr } = getSriLankaDayBounds(now);
    const datePart = dateStr.replace(/-/g, '').slice(2); // e.g. "260923"

    const todaySalesCount = await PosSale.count({
      where: {
        createdAt: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
      },
      transaction,
    });

    let sequence = todaySalesCount + 1;
    let candidate = `POS-${datePart}-${sequence.toString().padStart(4, '0')}`;

    while (await PosSale.findOne({ where: { receiptNumber: candidate }, transaction })) {
      sequence++;
      candidate = `POS-${datePart}-${sequence.toString().padStart(4, '0')}`;
    }

    return candidate;
  }

  /**
   * Process and record a new POS Sale
   */
  async createSale(data, cashierId = null) {
    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (rawItems.length === 0) {
      throw new Error('Please add at least one item to the sale.');
    }

    const customerName = (data.customerName || 'Walk-in Customer').trim().substring(0, 100);
    const customerPhone = data.customerPhone ? String(data.customerPhone).trim().substring(0, 20) : null;
    const paymentMethod = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].includes(data.paymentMethod)
      ? data.paymentMethod
      : 'CASH';
    const notes = data.notes ? String(data.notes).trim() : null;
    const customerId = data.customerId ? parseInt(data.customerId, 10) : null;

    // Validate and sanitize items
    const parsedItems = [];
    let calculatedSubtotal = 0;

    for (const item of rawItems) {
      const itemName = (item.name || item.itemName || 'Custom Item').trim().substring(0, 255);
      const quantity = Math.max(0.01, parseFloat(item.quantity) || 1);
      const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
      const lineTotal = parseFloat((quantity * unitPrice).toFixed(2));
      const stockItemId = item.stockItemId ? parseInt(item.stockItemId, 10) : null;
      const unit = (item.unit || 'Pcs').trim().substring(0, 30);

      calculatedSubtotal += lineTotal;
      parsedItems.push({
        stockItemId,
        itemName,
        quantity,
        unitPrice,
        totalPrice: lineTotal,
        unit,
      });
    }

    calculatedSubtotal = parseFloat(calculatedSubtotal.toFixed(2));

    // Calculate discount
    let discount = Math.max(0, parseFloat(data.discount) || 0);
    const discountType = data.discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED';
    let discountAmount = 0;

    if (discountType === 'PERCENTAGE') {
      discountAmount = parseFloat(((calculatedSubtotal * discount) / 100).toFixed(2));
    } else {
      discountAmount = parseFloat(discount.toFixed(2));
    }

    if (discountAmount > calculatedSubtotal) {
      discountAmount = calculatedSubtotal;
    }

    const totalAmount = parseFloat(Math.max(0, calculatedSubtotal - discountAmount).toFixed(2));

    // Calculate amount tendered & change
    let amountTendered = parseFloat(data.amountTendered) || 0;
    if (amountTendered <= 0) {
      amountTendered = totalAmount; // Default to exact amount for cards/transfers/exact cash
    }

    const changeAmount = parseFloat(Math.max(0, amountTendered - totalAmount).toFixed(2));

    return await sequelize.transaction(async (t) => {
      const receiptNumber = await this.generateReceiptNumber(t);

      const sale = await PosSale.create({
        receiptNumber,
        saleDate: new Date(),
        subtotal: calculatedSubtotal,
        discount: discountAmount,
        discountType,
        totalAmount,
        paymentMethod,
        amountTendered,
        changeAmount,
        customerName,
        customerPhone,
        customerId,
        cashierId,
        notes,
        status: 'COMPLETED',
      }, { transaction: t });

      const createdItems = [];

      for (const pItem of parsedItems) {
        let unitCost = 0;

        // If item is linked to inventory, deduct stock and record stock transaction
        if (pItem.stockItemId) {
          const stockItem = await StockItem.findByPk(pItem.stockItemId, { transaction: t });
          if (stockItem) {
            unitCost = parseFloat(stockItem.unitCost || 0);
            const currentStock = parseFloat(stockItem.currentStock || 0);
            const newStock = Math.max(0, currentStock - pItem.quantity);

            stockItem.currentStock = newStock;
            await stockItem.save({ transaction: t });

            await StockTransaction.create({
              stockItemId: stockItem.id,
              type: 'OUT',
              quantity: pItem.quantity,
              balanceAfter: newStock,
              unitCost: parseFloat(unitCost.toFixed(2)),
              totalCost: parseFloat((unitCost * pItem.quantity).toFixed(2)),
              sellingPrice: pItem.unitPrice,
              reference: `POS #${receiptNumber}`,
              notes: `Sold via POS counter checkout to ${customerName}`,
              date: getSriLankaTodayString(),
            }, { transaction: t });
          }
        }

        const saleItem = await PosSaleItem.create({
          saleId: sale.id,
          stockItemId: pItem.stockItemId,
          itemName: pItem.itemName,
          quantity: pItem.quantity,
          unitPrice: pItem.unitPrice,
          totalPrice: pItem.totalPrice,
          unitCost,
          unit: pItem.unit,
        }, { transaction: t });

        createdItems.push(saleItem);
      }

      // Return fully hydrated sale
      return await PosSale.findByPk(sale.id, {
        include: [
          { model: PosSaleItem, as: 'items' },
          { model: User, as: 'cashier', attributes: ['id', 'username', 'fullName'] },
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'customerCode'] },
        ],
        transaction: t,
      });
    });
  }

  /**
   * Get all sales records with pagination & search filters
   */
  async getAllSales({
    search = '',
    dateFrom = '',
    dateTo = '',
    paymentMethod = 'ALL',
    status = 'ALL',
    page = 1,
    limit = 20,
    paginate = true,
  } = {}) {
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (paymentMethod && paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod;
    }

    // Date filtering (Sri Lanka timezone compliant)
    if (dateFrom && dateTo) {
      const start = new Date(`${dateFrom}T00:00:00+05:30`);
      const end = new Date(`${dateTo}T23:59:59.999+05:30`);
      where.createdAt = { [Op.gte]: start, [Op.lte]: end };
    } else if (dateFrom) {
      const start = new Date(`${dateFrom}T00:00:00+05:30`);
      where.createdAt = { [Op.gte]: start };
    } else if (dateTo) {
      const end = new Date(`${dateTo}T23:59:59.999+05:30`);
      where.createdAt = { [Op.lte]: end };
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { receiptNumber: { [Op.like]: q } },
        { customerName: { [Op.like]: q } },
        { customerPhone: { [Op.like]: q } },
      ];
    }

    const queryOptions = {
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: PosSaleItem, as: 'items' },
        { model: User, as: 'cashier', attributes: ['id', 'username', 'fullName'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'customerCode'] },
      ],
      distinct: true,
    };

    if (!paginate) {
      return await PosSale.findAll(queryOptions);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (pageNum - 1) * limitNum;

    queryOptions.limit = limitNum;
    queryOptions.offset = offset;

    const { count, rows: sales } = await PosSale.findAndCountAll(queryOptions);
    const pagination = buildPagination(count, pageNum, limitNum);

    return {
      sales,
      pagination,
    };
  }

  /**
   * Get sale details by ID
   */
  async getSaleById(id) {
    const sale = await PosSale.findByPk(id, {
      include: [
        {
          model: PosSaleItem,
          as: 'items',
          include: [{ model: StockItem, as: 'stockItem', attributes: ['id', 'name', 'code', 'unit'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'username', 'fullName'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'customerCode'] },
      ],
    });

    if (!sale) {
      throw new Error('Sale record not found.');
    }

    return sale;
  }

  /**
   * Get daily summary statistics (today's revenue, transaction count, payment breakdown)
   */
  async getDailyStats(date = new Date()) {
    const { startOfDay, endOfDay } = getSriLankaDayBounds(date);

    const todaySales = await PosSale.findAll({
      where: {
        createdAt: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
        status: 'COMPLETED',
      },
      attributes: ['id', 'totalAmount', 'paymentMethod', 'discount'],
    });

    let todaySalesCount = todaySales.length;
    let todayRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    let bankRevenue = 0;
    let otherRevenue = 0;
    let totalDiscount = 0;

    for (const sale of todaySales) {
      const amt = parseFloat(sale.totalAmount) || 0;
      todayRevenue += amt;
      totalDiscount += parseFloat(sale.discount) || 0;

      if (sale.paymentMethod === 'CASH') {
        cashRevenue += amt;
      } else if (sale.paymentMethod === 'CARD') {
        cardRevenue += amt;
      } else if (sale.paymentMethod === 'BANK_TRANSFER') {
        bankRevenue += amt;
      } else {
        otherRevenue += amt;
      }
    }

    return {
      todaySalesCount,
      todayRevenue: parseFloat(todayRevenue.toFixed(2)),
      cashRevenue: parseFloat(cashRevenue.toFixed(2)),
      cardRevenue: parseFloat(cardRevenue.toFixed(2)),
      bankRevenue: parseFloat(bankRevenue.toFixed(2)),
      otherRevenue: parseFloat(otherRevenue.toFixed(2)),
      totalDiscount: parseFloat(totalDiscount.toFixed(2)),
    };
  }

  /**
   * Void a sale and restore any deducted inventory items
   */
  async voidSale(id, userId = null) {
    const sale = await PosSale.findByPk(id, {
      include: [{ model: PosSaleItem, as: 'items' }],
    });

    if (!sale) {
      throw new Error('Sale record not found.');
    }

    if (sale.status === 'VOIDED') {
      throw new Error('This sale has already been voided.');
    }

    return await sequelize.transaction(async (t) => {
      // Restore inventory for any stock items in this sale
      if (sale.items && sale.items.length > 0) {
        for (const item of sale.items) {
          if (item.stockItemId) {
            const stockItem = await StockItem.findByPk(item.stockItemId, { transaction: t });
            if (stockItem) {
              const currentStock = parseFloat(stockItem.currentStock || 0);
              const restoredStock = currentStock + parseFloat(item.quantity);
              stockItem.currentStock = restoredStock;
              await stockItem.save({ transaction: t });

              await StockTransaction.create({
                stockItemId: stockItem.id,
                type: 'IN',
                quantity: parseFloat(item.quantity),
                balanceAfter: restoredStock,
                unitCost: parseFloat(stockItem.unitCost || 0),
                totalCost: parseFloat(((stockItem.unitCost || 0) * item.quantity).toFixed(2)),
                sellingPrice: item.unitPrice,
                reference: `Void POS #${sale.receiptNumber}`,
                notes: `Stock returned due to voided POS sale #${sale.receiptNumber}`,
                date: getSriLankaTodayString(),
              }, { transaction: t });
            }
          }
        }
      }

      sale.status = 'VOIDED';
      await sale.save({ transaction: t });

      return {
        success: true,
        message: `Sale #${sale.receiptNumber} has been successfully voided and inventory restored.`,
        sale,
      };
    });
  }
}

module.exports = new PosService();
