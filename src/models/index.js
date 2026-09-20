const sequelize = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const Order = require('./Order');
const StockItem = require('./StockItem');
const StockTransaction = require('./StockTransaction');
const QuickPrintJob = require('./QuickPrintJob');
const QuickPrintFile = require('./QuickPrintFile');

// Customer <-> Orders
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// StockItem <-> StockTransactions
StockItem.hasMany(StockTransaction, { foreignKey: 'stockItemId', as: 'transactions' });
StockTransaction.belongsTo(StockItem, { foreignKey: 'stockItemId', as: 'stockItem' });

// QuickPrintJob <-> QuickPrintFile
QuickPrintJob.hasMany(QuickPrintFile, { foreignKey: 'jobId', as: 'files', onDelete: 'CASCADE' });
QuickPrintFile.belongsTo(QuickPrintJob, { foreignKey: 'jobId', as: 'job' });

// Customer <-> QuickPrintJob
Customer.hasMany(QuickPrintJob, { foreignKey: 'customerId', as: 'quickPrintJobs' });
QuickPrintJob.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// Order <-> QuickPrintJob
Order.hasOne(QuickPrintJob, { foreignKey: 'orderId', as: 'quickPrintJob' });
QuickPrintJob.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

module.exports = {
  sequelize,
  User,
  Customer,
  Order,
  StockItem,
  StockTransaction,
  QuickPrintJob,
  QuickPrintFile,
};

