const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    trim: true,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM(
      'ADMIN',        // Owner / Admin
      'MANAGER',      // Shop / Operations Manager
      'SALES',        // Sales Staff / Cashier
      'PRODUCTION',   // Pre-press & Machine Operators
      'INVENTORY',    // Stock & Warehouse Staff
      'ACCOUNTANT'    // Billing & Receivables
    ),
    allowNull: false,
    defaultValue: 'SALES',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      isTenDigitsStartingWithZero(value) {
        if (value && !/^0\d{9}$/.test(value.trim())) {
          throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
        }
      },
    },
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
  },
});

User.prototype.verifyPassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = User;
