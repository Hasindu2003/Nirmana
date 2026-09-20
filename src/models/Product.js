const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
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
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_categories',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('PHYSICAL', 'SERVICE'),
    allowNull: false,
    defaultValue: 'SERVICE',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  unit: {
    type: DataTypes.ENUM('PCS', 'SHEETS', 'ROLLS', 'PACKS', 'BOXES', 'SQFT', 'HOURS'),
    allowNull: false,
    defaultValue: 'PCS',
  },
  unitPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  costPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  estimatedProductionTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 60,
  },
  defaultSpecs: {
    type: DataTypes.TEXT, // Stored as JSON string
    allowNull: true,
  },
  requiredMaterials: {
    type: DataTypes.TEXT, // Stored as JSON string
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'products',
});

module.exports = Product;
