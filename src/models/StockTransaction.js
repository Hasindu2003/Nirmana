const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockTransaction = sequelize.define('StockTransaction', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  stockItemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stock_items',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('IN', 'OUT'),
    allowNull: false, // 'IN' = Arrival/Add, 'OUT' = Usage/Deduct
  },
  quantity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  reference: {
    type: DataTypes.STRING(100),
    allowNull: true, // e.g. Order #, PO #, Slip #
  },
  unitCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true, // Buying price per unit
  },
  totalCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true, // Total batch buying price
  },
  sellingPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true, // Optional selling price per unit
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true, // reason, job name, or supplier info
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'stock_transactions',
});

module.exports = StockTransaction;
