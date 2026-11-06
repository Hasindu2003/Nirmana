const { sequelize, Order } = require('../src/models');

async function migrateOrderType() {
  console.log('--- Migrating orders table to add orderType column ---');
  try {
    // 1. Add orderType column if not exists
    await sequelize.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS "orderType" VARCHAR(50) DEFAULT 'GENERAL_PRINT';
    `);
    console.log('Column "orderType" added or already present.');

    // 2. Backfill existing orders based on keywords
    const [updateResult] = await sequelize.query(`
      UPDATE orders 
      SET "orderType" = 'PHOTO_FRAME' 
      WHERE (
        LOWER("jobTitle") LIKE '%frame%' 
        OR LOWER("paperMaterial") LIKE '%frame%' 
        OR LOWER("specifications") LIKE '%frame%' 
        OR LOWER("jobTitle") LIKE '%රාමු%'
        OR LOWER("jobTitle") LIKE '%framing%'
      )
      AND ("orderType" IS NULL OR "orderType" = 'GENERAL_PRINT');
    `);
    console.log('Backfilled photo frame orders.');

    // 3. Verify counts
    const [counts] = await sequelize.query(`
      SELECT "orderType", COUNT(*) as cnt 
      FROM orders 
      GROUP BY "orderType";
    `);
    console.log('Order counts by type:', counts);
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrateOrderType();

