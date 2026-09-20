const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuickPrintJob = sequelize.define('QuickPrintJob', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  tokenNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  customerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  customerPhone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isTenDigits(val) {
        if (!/^\d{10}$/.test(val)) {
          throw new Error('Phone number can have only 10 digits. No less or more.');
        }
      },
    },
  },
  customerMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  colorMode: {
    type: DataTypes.ENUM('COLOR', 'BW', 'MIXED', 'NOT_SPECIFIED'),
    allowNull: false,
    defaultValue: 'NOT_SPECIFIED',
  },
  copies: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  paperSize: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'A4',
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PRINTING', 'READY', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customers',
      key: 'id',
    },
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id',
    },
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  isPaid: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  printedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'quick_print_jobs',
  timestamps: true,
});

module.exports = QuickPrintJob;
