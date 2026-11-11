const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  orderNumber: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customers',
      key: 'id',
    },
  },
  orderDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  dueDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  jobTitle: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  paperMaterial: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  specifications: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
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
  advancePaid: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  balanceAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  status: {
    type: DataTypes.ENUM('RECEIVED', 'PRINTING', 'READY', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'RECEIVED',
  },
  orderType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'GENERAL_PRINT', // 'PHOTO_FRAME' or 'GENERAL_PRINT'
  },
  stockItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'stock_items',
      key: 'id',
    },
  },
  stockDeducted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  stockDeductedQty: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  wastageQty: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  paymentSlipUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  paymentSlipStatus: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null, // 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'
  },
  paymentSlipUploadedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  paymentSlipAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  paymentSlipRef: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  paymentSlipNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'orders',
});

module.exports = Order;
