const stockService = require('../services/stockService');

class StockController {
  async listItems(req, res, next) {
    try {
      const { search, category, page, limit } = req.query;
      const result = await stockService.getAllStockItems({
        search,
        category,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        paginate: page || limit ? true : false,
      });
      if (result && result.pagination) {
        return res.json({ success: true, data: result.items, pagination: result.pagination });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async createItem(req, res, next) {
    try {
      const { name, category, unit, initialStock, minStockAlert, unitCost, batchCost, sellingPrice, notes } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Stock item name is required.' });
      }

      const item = await stockService.createStockItem({
        name,
        category,
        unit,
        initialStock,
        minStockAlert,
        unitCost,
        batchCost,
        sellingPrice,
        notes,
      });

      return res.status(201).json({
        success: true,
        message: 'Stock item created successfully.',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  // Stock In: Record new stock arrived
  async recordStockIn(req, res, next) {
    try {
      const { stockItemId, quantity, reference, notes, date, unitCost, batchCost, sellingPrice } = req.body;
      if (!stockItemId || !quantity) {
        return res.status(400).json({ success: false, message: 'Stock item and quantity are required.' });
      }

      const result = await stockService.recordStockIn({
        stockItemId,
        quantity,
        reference,
        notes,
        date,
        unitCost,
        batchCost,
        sellingPrice,
      });

      return res.json({
        success: true,
        message: `Successfully added ${quantity} ${result.item.unit} to stock. New balance: ${result.item.currentStock} ${result.item.unit}.`,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // Stock Out: Record stock taken out to use
  async recordStockOut(req, res, next) {
    try {
      const { stockItemId, quantity, reference, notes, date } = req.body;
      if (!stockItemId || !quantity) {
        return res.status(400).json({ success: false, message: 'Stock item and quantity are required.' });
      }

      const result = await stockService.recordStockOut({
        stockItemId,
        quantity,
        reference,
        notes,
        date,
      });

      return res.json({
        success: true,
        message: `Successfully deducted ${quantity} ${result.item.unit} from stock. Remaining balance: ${result.item.currentStock} ${result.item.unit}.`,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async listTransactions(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await stockService.getRecentTransactions({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
        paginate: page || limit ? true : false,
      });
      if (result && result.pagination) {
        return res.json({ success: true, data: result.transactions, pagination: result.pagination });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StockController();
