const {
  sequelize,
  User,
} = require('../models');

async function seedDatabase() {
  console.log('--- Initializing Clean Production Database ---');
  await sequelize.sync({ force: true });
  console.log('✓ Database tables initialized cleanly (empty schema).');

  // Seed Admin User
  console.log('Seeding system administrator account...');
  await User.create({
    username: 'admin',
    email: 'admin@nirmana.lk',
    password: 'Password123!',
    fullName: 'Nirmana Shop Manager',
    role: 'ADMIN',
    phone: '0771234567',
    isActive: true,
  });
  console.log('✓ System admin account created (username: admin / password: Password123!)');
  console.log('✓ Database is completely clean and ready for real operational data.');
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Initialization complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error during seeding:', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
