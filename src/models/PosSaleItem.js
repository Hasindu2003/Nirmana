const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PosSaleItem = sequelize.define('PosSaleItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'pos_sales',
      key: 'id',
    },
  },
  stockItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'stock_items',
      key: 'id',
    },
  },
  itemName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 1,
  },
  unitPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  totalPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  unitCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  unit: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Pcs',
  },
}, {
  tableName: 'pos_sale_items',
  timestamps: true,
});

module.exports = PosSaleItem;
