const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id',
    },
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'products',
      key: 'id',
    },
  },
  itemDescription: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
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
  specifications: {
    type: DataTypes.TEXT, // Stored as JSON string
    allowNull: true,
  },
  estimatedProductionTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'order_items',
});

OrderItem.prototype.getParsedSpecs = function() {
  if (!this.specifications) return {};
  try {
    return JSON.parse(this.specifications);
  } catch (err) {
    return {};
  }
};

module.exports = OrderItem;
