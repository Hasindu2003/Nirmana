const { sequelize } = require('../src/models');

async function checkSize() {
  const [dbRes] = await sequelize.query(`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as total_db_size,
      pg_database_size(current_database()) as size_bytes;
  `);
  console.log('--- Overall Database Size ---');
  console.table(dbRes);

  const [tables] = await sequelize.query(`
    SELECT 
      table_name,
      pg_size_pretty(pg_total_relation_size('"' || table_name || '"')) AS total_size,
      pg_total_relation_size('"' || table_name || '"') AS size_bytes
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY size_bytes DESC;
  `);
  console.log('\n--- Table-by-Table Size Breakdown ---');
  console.table(tables);
  process.exit(0);
}

checkSize().catch(e => {
  console.error(e);
  process.exit(1);
});

