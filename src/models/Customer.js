const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  customerCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isTenDigitsStartingWithZero(value) {
        if (!/^0\d{9}$/.test(value)) {
          throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
        }
      },
    },
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  companyName: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'customers',
});

module.exports = Customer;
