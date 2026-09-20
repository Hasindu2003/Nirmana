const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentSchedule = sequelize.define('PaymentSchedule', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  scheduleNumber: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  paidAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  dueDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('SCHEDULED', 'DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'),
    allowNull: false,
    defaultValue: 'SCHEDULED',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'payment_schedules',
});

module.exports = PaymentSchedule;
