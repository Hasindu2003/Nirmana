const { Op } = require('sequelize');
const { sequelize, StockItem, StockTransaction } = require('../models');
const { getSriLankaTodayString } = require('../utils/dateUtils');

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

    // Calculate aggregated usage metrics (In, Out, Office Use) for all items
    const usageSummaries = await StockTransaction.findAll({
      attributes: [
        'stockItemId',
        'type',
        'category',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'sumQty'],
        [sequelize.fn('SUM', sequelize.col('totalCost')), 'sumCost'],
      ],
      group: ['stockItemId', 'type', 'category'],
      raw: true,
    }).catch(() => []);

    const usageMap = {};
    usageSummaries.forEach(row => {
      const id = row.stockItemId;
      if (!usageMap[id]) {
        usageMap[id] = { totalIn: 0, totalOut: 0, officeQty: 0, officeCost: 0, prodQty: 0 };
      }
      const qty = parseFloat(row.sumQty) || 0;
      const cost = parseFloat(row.sumCost) || 0;
      if (row.type === 'IN') {
        usageMap[id].totalIn += qty;
      } else if (row.type === 'OUT') {
        usageMap[id].totalOut += qty;
        if (row.category === 'OFFICE_USE') {
          usageMap[id].officeQty += qty;
          usageMap[id].officeCost += cost;
        } else {
          usageMap[id].prodQty += qty;
        }
      }
    });

    const enrichItem = (item) => {
      const u = usageMap[item.id] || { totalIn: 0, totalOut: 0, officeQty: 0, officeCost: 0, prodQty: 0 };
      const curStock = parseFloat(item.currentStock) || 0;
      const uCost = parseFloat(item.unitCost) || 0;
      item.dataValues.totalIn = u.totalIn;
      item.dataValues.totalUsed = u.totalOut;
      item.dataValues.officeUseQty = u.officeQty;
      item.dataValues.officeUseCost = u.officeCost;
      item.dataValues.productionUsedQty = u.prodQty;
      item.dataValues.remainingStock = curStock;
      item.dataValues.remainingValuation = parseFloat((curStock * uCost).toFixed(2));
      return item;
    };

    if (!paginate) {
      const items = await StockItem.findAll(queryOptions);
      return items.map(enrichItem);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    queryOptions.limit = limitNum;
    queryOptions.offset = offset;

    const { count, rows: rawItems } = await StockItem.findAndCountAll(queryOptions);
    const items = rawItems.map(enrichItem);
    const pagination = buildPagination(count, pageNum, limitNum);

    // Calculate global inventory summary metrics
    const allActive = await StockItem.findAll({ where: { isActive: true }, attributes: ['currentStock', 'unitCost'] });
    let totalValuation = 0;
    allActive.forEach(i => {
      totalValuation += (parseFloat(i.currentStock) || 0) * (parseFloat(i.unitCost) || 0);
    });
    let totalOfficeUseVal = 0;
    Object.values(usageMap).forEach(u => {
      totalOfficeUseVal += u.officeCost;
    });

    const inventorySummary = {
      totalItems: count,
      totalRemainingValuation: parseFloat(totalValuation.toFixed(2)),
      totalOfficeUseValue: parseFloat(totalOfficeUseVal.toFixed(2)),
    };

    return {
      items,
      pagination,
      inventorySummary,
    };
  }

  async getStockItemById(id) {
    const item = await StockItem.findByPk(id, {
      include: [
        {
          model: StockTransaction,
          as: 'transactions',
          limit: 30,
          order: [['createdAt', 'DESC']],
        },
      ],
    });
    if (!item) throw new Error('Stock item not found.');

    // Calculate item specific usage summary
    const txSummary = await StockTransaction.findAll({
      where: { stockItemId: id },
      attributes: [
        'type',
        'category',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'sumQty'],
        [sequelize.fn('SUM', sequelize.col('totalCost')), 'sumCost'],
      ],
      group: ['type', 'category'],
      raw: true,
    }).catch(() => []);

    let totalIn = 0;
    let totalOut = 0;
    let officeQty = 0;
    let officeCost = 0;
    let prodQty = 0;

    txSummary.forEach(r => {
      const q = parseFloat(r.sumQty) || 0;
      const c = parseFloat(r.sumCost) || 0;
      if (r.type === 'IN') {
        totalIn += q;
      } else if (r.type === 'OUT') {
        totalOut += q;
        if (r.category === 'OFFICE_USE') {
          officeQty += q;
          officeCost += c;
        } else {
          prodQty += q;
        }
      }
    });

    item.dataValues.totalIn = totalIn;
    item.dataValues.totalUsed = totalOut;
    item.dataValues.officeUseQty = officeQty;
    item.dataValues.officeUseCost = officeCost;
    item.dataValues.productionUsedQty = prodQty;
    item.dataValues.remainingValuation = (parseFloat(item.currentStock) || 0) * (parseFloat(item.unitCost) || 0);

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

      const width = data.width !== undefined && data.width !== '' && !isNaN(parseFloat(data.width)) ? parseFloat(data.width) : null;
      const length = data.length !== undefined && data.length !== '' && !isNaN(parseFloat(data.length)) ? parseFloat(data.length) : null;
      const dimensionUnit = data.dimensionUnit || 'inches';
      const sizeLabel = data.sizeLabel || (width && length ? `${width}x${length} ${dimensionUnit}` : null);

      const item = await StockItem.create({
        code,
        name: data.name,
        category: data.category || 'Paper / Substrate',
        unit: data.unit || 'Sheets',
        currentStock: initialStock,
        minStockAlert: parseFloat(data.minStockAlert) || 10,
        unitCost: parseFloat(unitCost.toFixed(2)),
        sellingPrice: sellingPrice !== null ? parseFloat(sellingPrice.toFixed(2)) : null,
        width,
        length,
        dimensionUnit,
        sizeLabel,
        notes: data.notes || null,
        isActive: true,
      }, { transaction: t });

      if (initialStock > 0) {
        await StockTransaction.create({
          stockItemId: item.id,
          type: 'IN',
          category: 'INITIAL',
          quantity: initialStock,
          balanceAfter: initialStock,
          unitCost: parseFloat(unitCost.toFixed(2)),
          totalCost: parseFloat(totalBatchCost.toFixed(2)),
          sellingPrice: sellingPrice !== null ? parseFloat(sellingPrice.toFixed(2)) : null,
          reference: 'Initial Stock Setup',
          notes: 'Initial stock recorded on creation',
          date: getSriLankaTodayString(),
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
      width: data.width !== undefined ? (data.width ? parseFloat(data.width) : null) : item.width,
      length: data.length !== undefined ? (data.length ? parseFloat(data.length) : null) : item.length,
      dimensionUnit: data.dimensionUnit !== undefined ? data.dimensionUnit : item.dimensionUnit,
      sizeLabel: data.sizeLabel !== undefined ? data.sizeLabel : item.sizeLabel,
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
        category: 'PURCHASE',
        quantity: qty,
        balanceAfter: newBalance,
        unitCost: parseFloat(parsedUnitCost.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        sellingPrice: parsedSellingPrice !== null ? parseFloat(parsedSellingPrice.toFixed(2)) : null,
        reference: reference || 'Stock Arrival',
        notes: notes || 'New stock added to inventory',
        date: date || getSriLankaTodayString(),
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
  async recordStockOut({ stockItemId, quantity, reference, notes, date, category = 'PRODUCTION' }) {
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

      const uCost = parseFloat(item.unitCost) || 0.00;
      const totalCost = parseFloat((uCost * qty).toFixed(2));

      const transaction = await StockTransaction.create({
        stockItemId: item.id,
        type: 'OUT',
        category: category || 'PRODUCTION',
        quantity: qty,
        balanceAfter: newBalance,
        unitCost: uCost,
        totalCost: totalCost,
        reference: reference || 'Job Usage',
        notes: notes || 'Materials deducted for print production',
        date: date || getSriLankaTodayString(),
      }, { transaction: t });

      return { item, transaction };
    });
  }

  // Office Use: Deduct materials for internal shop / office consumption
  async recordOfficeUse({ stockItemId, quantity, department, notes, date }) {
    return await sequelize.transaction(async (t) => {
      const item = await StockItem.findByPk(stockItemId, { transaction: t });
      if (!item) throw new Error('Stock item not found.');

      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Office use quantity must be greater than zero.');
      }

      const current = parseFloat(item.currentStock) || 0;
      if (qty > current) {
        throw new Error(`Cannot take ${qty} ${item.unit} for office use. Only ${current} ${item.unit} remaining in stock!`);
      }

      const unitCost = parseFloat(item.unitCost) || 0.00;
      const totalExpense = parseFloat((unitCost * qty).toFixed(2));

      const newBalance = current - qty;
      item.currentStock = newBalance;
      await item.save({ transaction: t });

      const deptName = department && department.trim() ? department.trim() : 'Administration';
      const transaction = await StockTransaction.create({
        stockItemId: item.id,
        type: 'OUT',
        category: 'OFFICE_USE',
        quantity: qty,
        balanceAfter: newBalance,
        unitCost: unitCost,
        totalCost: totalExpense,
        reference: `Office Use: ${deptName}`,
        notes: notes || `Internal office consumption by ${deptName}`,
        date: date || getSriLankaTodayString(),
      }, { transaction: t });

      return {
        item,
        transaction,
        officeUseValue: totalExpense,
        department: deptName,
      };
    });
  }

  async getOfficeUseTransactions(options = {}) {
    let page = 1;
    let limit = 10;
    let paginate = true;
    let date = null;

    if (typeof options === 'object') {
      page = options.page || 1;
      limit = options.limit || 10;
      paginate = options.paginate !== undefined ? options.paginate : true;
      date = options.date || null;
    }

    const where = {
      type: 'OUT',
      [Op.or]: [
        { category: 'OFFICE_USE' },
        { reference: { [Op.like]: '%Office%' } },
      ],
    };
    if (date) where.date = date;

    const queryOptions = {
      where,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: StockItem,
          as: 'stockItem',
          attributes: ['id', 'code', 'name', 'unit', 'category', 'unitCost'],
        },
      ],
    };

    if (!paginate) {
      return await StockTransaction.findAll(queryOptions);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    queryOptions.limit = limitNum;
    queryOptions.offset = (pageNum - 1) * limitNum;

    const { count, rows: transactions } = await StockTransaction.findAndCountAll(queryOptions);
    const pagination = buildPagination(count, pageNum, limitNum);

    return { transactions, pagination };
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
