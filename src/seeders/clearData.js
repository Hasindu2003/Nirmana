const { sequelize, User, Customer, Order, StockItem, StockTransaction } = require('../models');

async function clearFakeData() {
  console.log('--- Clearing all fake data from the system ---');
  
  // Disable foreign keys temporarily for clean deletion in SQLite
  await sequelize.query('PRAGMA foreign_keys = OFF;');

  const ordersDeleted = await Order.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared all Orders (${ordersDeleted} removed)`);

  const customersDeleted = await Customer.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared all Customers (${customersDeleted} removed)`);

  const transactionsDeleted = await StockTransaction.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared all Stock Transactions (${transactionsDeleted} removed)`);

  const stockItemsDeleted = await StockItem.destroy({ where: {}, truncate: true });
  console.log(`✓ Cleared all Stock Items (${stockItemsDeleted} removed)`);

  // Re-enable foreign keys
  await sequelize.query('PRAGMA foreign_keys = ON;');

  // Ensure default admin user exists
  const adminCount = await User.count({ where: { username: 'admin' } });
  if (adminCount === 0) {
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
    console.log('✓ Preserved admin user account.');
  }

  console.log('--- All fake data successfully removed! System is now clean. ---');
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
