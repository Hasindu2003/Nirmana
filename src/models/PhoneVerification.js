const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PhoneVerification = sequelize.define('PhoneVerification', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isTenDigits(val) {
        if (!/^0\d{9}$/.test(val)) {
          throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
        }
      },
    },
  },
  otp: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'phone_verifications',
  timestamps: true,
  indexes: [
    {
      fields: ['phone'],
    },
  ],
});

module.exports = PhoneVerification;
