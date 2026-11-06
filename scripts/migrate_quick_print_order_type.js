const sequelize = require('../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');
    const dialect = sequelize.getDialect();
    if (dialect === 'postgres') {
      await sequelize.query('ALTER TABLE quick_print_jobs ADD COLUMN IF NOT EXISTS "orderType" VARCHAR(50) DEFAULT \'GENERAL_PRINT\';');
    } else {
      try {
        await sequelize.query('ALTER TABLE quick_print_jobs ADD COLUMN orderType TEXT DEFAULT "GENERAL_PRINT";');
      } catch (e) {
        // column may already exist
      }
    }
    console.log('✓ Successfully ensured orderType column on quick_print_jobs table.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();

