const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PosSale = sequelize.define('PosSale', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  receiptNumber: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  saleDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  discount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  discountType: {
    type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
    allowNull: false,
    defaultValue: 'FIXED',
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  paymentMethod: {
    type: DataTypes.ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'),
    allowNull: false,
    defaultValue: 'CASH',
  },
  amountTendered: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  changeAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  customerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Walk-in Customer',
  },
  customerPhone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customers',
      key: 'id',
    },
  },
  cashierId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('COMPLETED', 'VOIDED'),
    allowNull: false,
    defaultValue: 'COMPLETED',
  },
}, {
  tableName: 'pos_sales',
  timestamps: true,
});

module.exports = PosSale;
