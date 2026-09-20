const { Op } = require('sequelize');
const { sequelize, StockItem, StockTransaction } = require('../models');

const { buildPagination } = require('../utils/pagination');

class StockService {
  async getAllStockItems({ search, category, page, limit = 10, paginate = false } = {}) {
    const where = { isActive: true };

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { category: { [Op.like]: q } },
      ];
    }

    const queryOptions = {
      where,
      order: [['name', 'ASC']],
    };

    if (!paginate) {
      return await StockItem.findAll(queryOptions);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    queryOptions.limit = limitNum;
    queryOptions.offset = offset;

    const { count, rows: items } = await StockItem.findAndCountAll(queryOptions);
    const pagination = buildPagination(count, pageNum, limitNum);

    return {
      items,
      pagination,
    };
  }

  async getStockItemById(id) {
    const item = await StockItem.findByPk(id, {
      include: [
        {
          model: StockTransaction,
          as: 'transactions',
          limit: 20,
          order: [['createdAt', 'DESC']],
        },
      ],
    });
    if (!item) throw new Error('Stock item not found.');
    return item;
  }

  async createStockItem(data) {
    return await sequelize.transaction(async (t) => {
      let code = data.code;
      if (!code) {
        const count = await StockItem.count({ transaction: t });
        code = `STK-${(count + 1).toString().padStart(4, '0')}`;
      }

      const initialStock = parseFloat(data.initialStock) || 0;
      let unitCost = parseFloat(data.unitCost);
      const batchCost = parseFloat(data.batchCost);

      if ((isNaN(unitCost) || unitCost === 0) && !isNaN(batchCost) && batchCost > 0 && initialStock > 0) {
        unitCost = batchCost / initialStock;
      } else if (isNaN(unitCost)) {
        unitCost = 0.00;
      }

      const totalBatchCost = !isNaN(batchCost) && batchCost > 0 ? batchCost : (unitCost * initialStock);

      const sellingPrice = data.sellingPrice !== undefined && data.sellingPrice !== '' && !isNaN(parseFloat(data.sellingPrice))
        ? parseFloat(data.sellingPrice)
        : null;

      const item = await StockItem.create({
        code,
        name: data.name,
        category: data.category || 'Paper / Substrate',
        unit: data.unit || 'Sheets',
        currentStock: initialStock,
        minStockAlert: parseFloat(data.minStockAlert) || 10,
        unitCost: parseFloat(unitCost.toFixed(2)),
        sellingPrice: sellingPrice !== null ? parseFloat(sellingPrice.toFixed(2)) : null,
        notes: data.notes || null,
        isActive: true,
      }, { transaction: t });

      if (initialStock > 0) {
        await StockTransaction.create({
          stockItemId: item.id,
          type: 'IN',
          quantity: initialStock,
          balanceAfter: initialStock,
          unitCost: parseFloat(unitCost.toFixed(2)),
          totalCost: parseFloat(totalBatchCost.toFixed(2)),
          sellingPrice: sellingPrice !== null ? parseFloat(sellingPrice.toFixed(2)) : null,
          reference: 'Initial Stock Setup',
          notes: 'Initial stock recorded on creation',
          date: new Date(),
        }, { transaction: t });
      }

      return item;
    });
  }

  async updateStockItem(id, data) {
    const item = await StockItem.findByPk(id);
    if (!item) throw new Error('Stock item not found.');

    await item.update({
      name: data.name !== undefined ? data.name : item.name,
      category: data.category !== undefined ? data.category : item.category,
      unit: data.unit !== undefined ? data.unit : item.unit,
      minStockAlert: data.minStockAlert !== undefined ? parseFloat(data.minStockAlert) : item.minStockAlert,
      unitCost: data.unitCost !== undefined ? parseFloat(data.unitCost) : item.unitCost,
      sellingPrice: data.sellingPrice !== undefined ? (data.sellingPrice ? parseFloat(data.sellingPrice) : null) : item.sellingPrice,
      notes: data.notes !== undefined ? data.notes : item.notes,
    });

    return item;
  }

  // Stock In: When new stock arrives (Add)
  async recordStockIn({ stockItemId, quantity, reference, notes, date, unitCost, batchCost, sellingPrice }) {
    return await sequelize.transaction(async (t) => {
      const item = await StockItem.findByPk(stockItemId, { transaction: t });
      if (!item) throw new Error('Stock item not found.');

      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }

      let parsedUnitCost = unitCost !== undefined && unitCost !== '' && !isNaN(parseFloat(unitCost))
        ? parseFloat(unitCost)
        : null;
      const parsedBatchCost = batchCost !== undefined && batchCost !== '' && !isNaN(parseFloat(batchCost))
        ? parseFloat(batchCost)
        : null;

      if (parsedUnitCost === null && parsedBatchCost !== null && qty > 0) {
        parsedUnitCost = parsedBatchCost / qty;
      } else if (parsedUnitCost === null) {
        parsedUnitCost = parseFloat(item.unitCost) || 0;
      }

      const totalCost = parsedBatchCost !== null ? parsedBatchCost : (parsedUnitCost * qty);

      const parsedSellingPrice = sellingPrice !== undefined && sellingPrice !== '' && !isNaN(parseFloat(sellingPrice))
        ? parseFloat(sellingPrice)
        : (item.sellingPrice ? parseFloat(item.sellingPrice) : null);

      const newBalance = (parseFloat(item.currentStock) || 0) + qty;
      item.currentStock = newBalance;
      if (parsedUnitCost > 0) {
        item.unitCost = parseFloat(parsedUnitCost.toFixed(2));
      }
      if (parsedSellingPrice !== null) {
        item.sellingPrice = parseFloat(parsedSellingPrice.toFixed(2));
      }
      await item.save({ transaction: t });

      const transaction = await StockTransaction.create({
        stockItemId: item.id,
        type: 'IN',
        quantity: qty,
        balanceAfter: newBalance,
        unitCost: parseFloat(parsedUnitCost.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        sellingPrice: parsedSellingPrice !== null ? parseFloat(parsedSellingPrice.toFixed(2)) : null,
        reference: reference || 'Stock Arrival',
        notes: notes || 'New stock added to inventory',
        date: date || new Date(),
      }, { transaction: t });

      let profitInfo = null;
      if (parsedSellingPrice !== null && parsedSellingPrice > 0) {
        const unitProfit = parsedSellingPrice - parsedUnitCost;
        const totalProfit = unitProfit * qty;
        const marginPercent = ((unitProfit / parsedSellingPrice) * 100);
        profitInfo = {
          unitCost: parsedUnitCost,
          sellingPrice: parsedSellingPrice,
          unitProfit: parseFloat(unitProfit.toFixed(2)),
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          batchProfit: parseFloat(totalProfit.toFixed(2)),
          marginPercent: parseFloat(marginPercent.toFixed(1)),
          isProfit: unitProfit >= 0,
        };
      }

      return { item, transaction, profitInfo };
    });
  }

  // Stock Out: When something is taken out to use (Deduct)
  async recordStockOut({ stockItemId, quantity, reference, notes, date }) {
    return await sequelize.transaction(async (t) => {
      const item = await StockItem.findByPk(stockItemId, { transaction: t });
      if (!item) throw new Error('Stock item not found.');

      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }

      const current = parseFloat(item.currentStock) || 0;
      if (qty > current) {
        throw new Error(`Cannot use ${qty} ${item.unit}. Only ${current} ${item.unit} available in stock!`);
      }

      const newBalance = current - qty;
      item.currentStock = newBalance;
      await item.save({ transaction: t });

      const transaction = await StockTransaction.create({
        stockItemId: item.id,
        type: 'OUT',
        quantity: qty,
        balanceAfter: newBalance,
        reference: reference || 'Job Usage',
        notes: notes || 'Materials deducted for print production',
        date: date || new Date(),
      }, { transaction: t });

      return { item, transaction };
    });
  }

  async getRecentTransactions(options = {}) {
    let page = 1;
    let limit = 10;
    let paginate = false;

    if (typeof options === 'number') {
      limit = options;
    } else if (typeof options === 'object') {
      page = options.page || 1;
      limit = options.limit || 10;
      paginate = options.paginate !== undefined ? options.paginate : false;
    }

    const queryOptions = {
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: StockItem,
          as: 'stockItem',
          attributes: ['id', 'code', 'name', 'unit', 'category'],
        },
      ],
    };

    if (!paginate) {
      queryOptions.limit = parseInt(limit, 10);
      return await StockTransaction.findAll(queryOptions);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    queryOptions.limit = limitNum;
    queryOptions.offset = offset;

    const { count, rows: transactions } = await StockTransaction.findAndCountAll(queryOptions);
    const pagination = buildPagination(count, pageNum, limitNum);

    return {
      transactions,
      pagination,
    };
  }
}

module.exports = new StockService();
