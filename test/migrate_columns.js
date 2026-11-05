const sequelize = require('../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');
    await sequelize.query('ALTER TABLE orders ALTER COLUMN "paymentSlipUrl" TYPE TEXT;');
    console.log('Successfully altered orders.paymentSlipUrl to TEXT');
    await sequelize.query('ALTER TABLE quick_print_files ALTER COLUMN "fileUrl" TYPE TEXT;');
    console.log('Successfully altered quick_print_files.fileUrl to TEXT');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
