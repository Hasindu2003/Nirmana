const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Customer,
  Order,
  StockItem,
  StockTransaction,
  PosSale,
  PosSaleItem,
  QuickPrintJob,
  QuickPrintFile,
  AuditLog,
  PhoneVerification,
} = require('../models');

async function clearFakeData() {
  console.log('--- Clearing all dummy data from the system ---');
  
  if (sequelize.getDialect() === 'sqlite') {
    await sequelize.query('PRAGMA foreign_keys = OFF;');
  }

  const saleItemsDeleted = await PosSaleItem.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared POS Sale Items (${saleItemsDeleted} removed)`);

  const salesDeleted = await PosSale.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared POS Sales (${salesDeleted} removed)`);

  const qpFilesDeleted = await QuickPrintFile.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Quick Print Files (${qpFilesDeleted} removed)`);

  const qpJobsDeleted = await QuickPrintJob.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Quick Print Jobs (${qpJobsDeleted} removed)`);

  const ordersDeleted = await Order.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Orders (${ordersDeleted} removed)`);

  const customersDeleted = await Customer.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Customers (${customersDeleted} removed)`);

  const transactionsDeleted = await StockTransaction.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Stock Transactions (${transactionsDeleted} removed)`);

  const stockItemsDeleted = await StockItem.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Stock Items (${stockItemsDeleted} removed)`);

  const auditDeleted = await AuditLog.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared Audit Logs (${auditDeleted} removed)`);

  if (PhoneVerification) {
    const pvDeleted = await PhoneVerification.destroy({ where: {}, truncate: true }).catch(() => 0);
    console.log(`✓ Cleared Phone Verifications (${pvDeleted} removed)`);
  }

  // Remove test users and preserve only primary admin
  const usersDeleted = await User.destroy({
    where: {
      username: { [Op.ne]: 'admin' },
    },
  });
  console.log(`✓ Cleared Test Users (${usersDeleted} removed, admin preserved)`);

  // Reset SQLite auto-increment sequences
  if (sequelize.getDialect() === 'sqlite') {
    try {
      await sequelize.query('DELETE FROM sqlite_sequence;');
      console.log('✓ Reset SQLite ID sequences.');
    } catch (e) {}
    await sequelize.query('PRAGMA foreign_keys = ON;');
  }

  // Ensure default admin user exists
  const existingAdmin = await User.findOne({ where: { username: 'admin' } });
  if (!existingAdmin) {
    await User.create({
      username: 'admin',
      email: 'admin@nirmana.lk',
      password: 'Password123!',
      fullName: 'Nirmana Shop Manager',
      role: 'ADMIN',
      phone: '0771234567',
      isActive: true,
    });
    console.log('✓ Initialized default admin user (admin / Password123!)');
  } else {
    // Reset admin password to standard Password123! if it was modified
    existingAdmin.password = 'Password123!';
    existingAdmin.role = 'ADMIN';
    existingAdmin.fullName = 'Nirmana Shop Manager';
    existingAdmin.phone = '0771234567';
    existingAdmin.isActive = true;
    await existingAdmin.save();
    console.log('✓ Preserved and verified primary admin user (admin / Password123!).');
  }

  console.log('--- All dummy data successfully removed! System is now clean and production-ready. ---');
}

if (require.main === module) {
  clearFakeData()
    .then(() => {
      console.log('Clean execution complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error clearing fake data:', err);
      process.exit(1);
    });
}

module.exports = clearFakeData;
