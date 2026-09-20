const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuickPrintFile = sequelize.define('QuickPrintFile', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  jobId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'quick_print_jobs',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  originalName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  filePath: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  fileUrl: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
}, {
  tableName: 'quick_print_files',
  timestamps: true,
});

module.exports = QuickPrintFile;
