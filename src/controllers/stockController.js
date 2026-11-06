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
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async createItem(req, res, next) {
    try {
      const { name, category, unit, initialStock, minStockAlert, unitCost, batchCost, sellingPrice, notes, width, length, dimensionUnit, sizeLabel, imageUrl } = req.body;
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
        width,
        length,
        dimensionUnit,
        sizeLabel,
        imageUrl,
      });

      return res.status(201).json({
        success: true,
        message: 'Stock item created successfully.',
        data: item,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
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

  // Office Use: Record stock taken for internal office/business usage
  async recordOfficeUse(req, res, next) {
    try {
      const { stockItemId, quantity, department, notes, date } = req.body;
      if (!stockItemId || !quantity) {
        return res.status(400).json({ success: false, message: 'Stock item and quantity are required.' });
      }

      const result = await stockService.recordOfficeUse({
        stockItemId,
        quantity,
        department,
        notes,
        date,
      });

      return res.json({
        success: true,
        message: `Successfully allocated ${quantity} ${result.item.unit} for office use (${result.department}). Remaining balance: ${result.item.currentStock} ${result.item.unit}. Expense value: Rs. ${result.officeUseValue.toFixed(2)}.`,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async listOfficeUse(req, res, next) {
    try {
      const { page, limit, date } = req.query;
      const result = await stockService.getOfficeUseTransactions({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
        paginate: true,
        date,
      });
      return res.json({ success: true, data: result.transactions, pagination: result.pagination });
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
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Record Stock Removal / Write-off / Wastage / Damage
   */
  async recordStockRemoval(req, res, next) {
    try {
      const { stockItemId, quantity, reason, reference, notes, date } = req.body;
      if (!stockItemId || !quantity) {
        return res.status(400).json({
          success: false,
          message: 'stockItemId and quantity are required.',
        });
      }

      const result = await stockService.recordStockRemoval({
        stockItemId: parseInt(stockItemId, 10),
        quantity: parseFloat(quantity),
        reason,
        reference,
        notes,
        date,
      });

      return res.json({
        success: true,
        message: `Successfully removed ${result.removedQty} ${result.item.unit} (${result.reasonLabel}) from stock.`,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete or archive a stock item
   */
  async deleteItem(req, res, next) {
    try {
      const { id } = req.params;
      const result = await stockService.deleteStockItem(id);
      return res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * List removed / damaged / written-off stock transactions
   */
  async listRemoved(req, res, next) {
    try {
      const { page, limit, reason, date } = req.query;
      const result = await stockService.getRemovedStockTransactions({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
        reason,
        date,
        paginate: true,
      });
      return res.json({
        success: true,
        data: result.transactions,
        pagination: result.pagination,
        summary: result.summary,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new StockController();
