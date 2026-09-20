const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  paymentNumber: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id',
    },
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id',
    },
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  paymentMethod: {
    type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER'),
    allowNull: false,
    defaultValue: 'CASH',
  },
  referenceNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  paymentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  recordedById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
}, {
  tableName: 'payments',
});

module.exports = Payment;
