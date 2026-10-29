const {
  sequelize,
  User,
} = require('../models');

async function seedDatabase() {
  console.log('--- Initializing Clean Production Database ---');
  await sequelize.sync();
  console.log('✓ Database schema synchronized.');

  // Seed Admin User
  console.log('Seeding system administrator account...');
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
    console.log('✓ System admin account created (username: admin / password: Password123!)');
  } else {
    console.log('✓ System admin account already exists (username: admin).');
  }
  console.log('✓ Database is ready for operations.');
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
