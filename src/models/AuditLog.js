const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  entityName: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  entityId: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  details: {
    type: DataTypes.TEXT, // JSON string
    allowNull: true,
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
}, {
  tableName: 'audit_logs',
  updatedAt: false, // Audit logs are write-only/immutable
});

module.exports = AuditLog;
