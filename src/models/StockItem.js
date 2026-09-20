const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockItem = sequelize.define('StockItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  code: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Paper / Substrate',
  },
  unit: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Sheets',
  },
  currentStock: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  minStockAlert: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 10,
  },
  unitCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  sellingPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'stock_items',
});

// Helper to check stock status
StockItem.prototype.getStockStatus = function() {
  const current = parseFloat(this.currentStock) || 0;
  const min = parseFloat(this.minStockAlert) || 0;
  if (current <= 0) return { status: 'OUT_OF_STOCK', badgeClass: 'status-cancelled', label: 'Out of Stock' };
  if (current <= min) return { status: 'LOW_STOCK', badgeClass: 'status-printing', label: 'Low Stock' };
  return { status: 'IN_STOCK', badgeClass: 'status-ready', label: 'In Stock' };
};

// Helper to calculate profit metrics
StockItem.prototype.getProfitInfo = function() {
  const cost = parseFloat(this.unitCost) || 0;
  const sell = this.sellingPrice !== null && this.sellingPrice !== undefined ? parseFloat(this.sellingPrice) : null;
  if (sell === null || isNaN(sell) || sell <= 0) {
    return null;
  }
  const unitProfit = sell - cost;
  const marginPercent = sell > 0 ? ((unitProfit / sell) * 100) : 0;
  return {
    unitProfit,
    marginPercent: parseFloat(marginPercent.toFixed(1)),
    isProfit: unitProfit >= 0,
  };
};

module.exports = StockItem;
