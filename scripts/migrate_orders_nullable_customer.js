const { sequelize } = require('../src/models');

async function migrate() {
  console.log('Migrating orders table to allow nullable customerId...');
  await sequelize.query('PRAGMA foreign_keys=off;');
  await sequelize.query('BEGIN TRANSACTION;');
  await sequelize.query(`
    CREATE TABLE \`orders_new\` (
      \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
      \`orderNumber\` VARCHAR(30) NOT NULL UNIQUE,
      \`customerId\` INTEGER REFERENCES \`customers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
      \`orderDate\` DATE NOT NULL,
      \`dueDate\` DATE,
      \`jobTitle\` VARCHAR(255) NOT NULL,
      \`paperMaterial\` VARCHAR(150),
      \`specifications\` TEXT,
      \`quantity\` INTEGER NOT NULL DEFAULT 1,
      \`subtotal\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`discount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`discountType\` TEXT NOT NULL DEFAULT 'FIXED',
      \`totalAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`advancePaid\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`balanceAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`status\` TEXT NOT NULL DEFAULT 'RECEIVED',
      \`notes\` TEXT,
      \`createdAt\` DATETIME NOT NULL,
      \`updatedAt\` DATETIME NOT NULL
    );
  `);
  await sequelize.query('INSERT INTO `orders_new` SELECT * FROM `orders`;');
  await sequelize.query('DROP TABLE `orders`;');
  await sequelize.query('ALTER TABLE `orders_new` RENAME TO `orders`;');
  await sequelize.query('COMMIT;');
  await sequelize.query('PRAGMA foreign_keys=on;');
  console.log('Successfully migrated orders table: customerId is now nullable!');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

