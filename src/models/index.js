const sequelize = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const Order = require('./Order');
const StockItem = require('./StockItem');
const StockTransaction = require('./StockTransaction');
const QuickPrintJob = require('./QuickPrintJob');
const QuickPrintFile = require('./QuickPrintFile');
const AuditLog = require('./AuditLog');
const PosSale = require('./PosSale');
const PosSaleItem = require('./PosSaleItem');

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

// PosSale <-> PosSaleItem
PosSale.hasMany(PosSaleItem, { foreignKey: 'saleId', as: 'items', onDelete: 'CASCADE' });
PosSaleItem.belongsTo(PosSale, { foreignKey: 'saleId', as: 'sale' });

// PosSaleItem <-> StockItem
StockItem.hasMany(PosSaleItem, { foreignKey: 'stockItemId', as: 'posSaleItems' });
PosSaleItem.belongsTo(StockItem, { foreignKey: 'stockItemId', as: 'stockItem' });

// PosSale <-> Customer & User
Customer.hasMany(PosSale, { foreignKey: 'customerId', as: 'posSales' });
PosSale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(PosSale, { foreignKey: 'cashierId', as: 'posSales' });
PosSale.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });

// Customer <-> User (Customer Portal Login Account)
Customer.belongsTo(User, { foreignKey: 'userId', as: 'userAccount' });
User.hasOne(Customer, { foreignKey: 'userId', as: 'customerProfile' });
User.belongsTo(Customer, { foreignKey: 'customerId', as: 'linkedCustomer' });

module.exports = {
  sequelize,
  User,
  Customer,
  Order,
  StockItem,
  StockTransaction,
  QuickPrintJob,
  QuickPrintFile,
  AuditLog,
  PosSale,
  PosSaleItem,
};

