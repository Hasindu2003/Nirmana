const {
  sequelize,
  User,
  Customer,
  Order,
  StockItem,
  StockTransaction,
} = require('../models');

async function seedDemoDatabase() {
  console.log('--- Seeding Demo / Sample Database ---');
  await sequelize.sync({ force: true });

  // 1. Admin User
  await User.create({
    username: 'admin',
    email: 'admin@nirmana.lk',
    password: 'Password123!',
    fullName: 'Nirmana Shop Manager',
    role: 'ADMIN',
    phone: '+94 77 123 4567',
    isActive: true,
  });

  // 2. Demo Stock Items
  const stockItemsData = [
    {
      code: 'STK-0001',
      name: 'Sappi 300gsm Art Board (Sheets)',
      category: 'Paper / Substrate',
      unit: 'Sheets',
      currentStock: 450,
      minStockAlert: 100,
      unitCost: 28.00,
      notes: 'Premium business card and brochure cover substrate',
    },
    {
      code: 'STK-0002',
      name: 'A4 80gsm High White Bond Paper (Reams)',
      category: 'Paper / Substrate',
      unit: 'Reams',
      currentStock: 35,
      minStockAlert: 15,
      unitCost: 1450.00,
      notes: 'Stationery and book interior printing',
    },
    {
      code: 'STK-0003',
      name: '150gsm Gloss Art Paper (Sheets)',
      category: 'Paper / Substrate',
      unit: 'Sheets',
      currentStock: 1200,
      minStockAlert: 300,
      unitCost: 14.50,
      notes: 'For marketing flyers and leaflet print runs',
    },
    {
      code: 'STK-0004',
      name: 'Eco-Solvent Cyan Ink (500ml Bottle)',
      category: 'Ink / Toner',
      unit: 'Bottles',
      currentStock: 2,
      minStockAlert: 5,
      unitCost: 8500.00,
      notes: 'Roland large-format press ink - Low Stock Alert!',
    },
    {
      code: 'STK-0005',
      name: 'Eco-Solvent Magenta Ink (500ml Bottle)',
      category: 'Ink / Toner',
      unit: 'Bottles',
      currentStock: 3,
      minStockAlert: 5,
      unitCost: 8500.00,
      notes: 'Roland large-format press ink - Low Stock Alert!',
    },
    {
      code: 'STK-0006',
      name: 'Eco-Solvent Black Ink (500ml Bottle)',
      category: 'Ink / Toner',
      unit: 'Bottles',
      currentStock: 8,
      minStockAlert: 5,
      unitCost: 8500.00,
      notes: 'Roland large-format press ink',
    },
    {
      code: 'STK-0007',
      name: 'Outdoor Heavy Gloss Vinyl 54" (Rolls)',
      category: 'Vinyl / Film',
      unit: 'Rolls',
      currentStock: 2,
      minStockAlert: 5,
      unitCost: 22000.00,
      notes: 'Large banner and sign board rolls - Low Stock Alert!',
    },
    {
      code: 'STK-0008',
      name: 'Blank Sublimation Ceramic Mugs (Pcs)',
      category: 'Merchandise / Blank',
      unit: 'Pcs',
      currentStock: 48,
      minStockAlert: 20,
      unitCost: 320.00,
      notes: 'Grade A 11oz white ceramic mugs with gift boxes',
    },
    {
      code: 'STK-0009',
      name: 'Thermal Matte Laminating Film (Rolls)',
      category: 'Finishing / Binding',
      unit: 'Rolls',
      currentStock: 6,
      minStockAlert: 2,
      unitCost: 6500.00,
      notes: 'Velvet soft-touch lamination film for cards and covers',
    },
  ];

  const createdItems = await StockItem.bulkCreate(stockItemsData);

  // 3. Demo Movements
  await StockTransaction.create({
    stockItemId: createdItems[0].id,
    type: 'IN',
    quantity: 500,
    balanceAfter: 500,
    reference: 'PO-2024-089',
    notes: 'Bulk shipment from Jinasena Paper Suppliers',
    date: '2024-10-15',
  });

  // 4. Demo Customers
  const cust1 = await Customer.create({
    customerCode: 'CUST-0001',
    name: 'Kasun Perera',
    phone: '+94 77 123 4567',
    email: 'kasun.p@gmail.com',
    companyName: 'Perera Media Consultants',
    address: '45 Galle Road, Colombo 03',
  });

  // 5. Demo Orders
  await Order.create({
    orderNumber: 'ORD-2024-0001',
    customerId: cust1.id,
    orderDate: '2024-10-20',
    dueDate: '2024-10-24',
    jobTitle: '500x Executive Business Cards (350gsm)',
    paperMaterial: 'Sappi 300gsm Art Board',
    specifications: 'Double-sided CMYK Full Color, Matte Velvet Lamination',
    quantity: 500,
    totalAmount: 4500.00,
    advancePaid: 2000.00,
    balanceAmount: 2500.00,
    status: 'PRINTING',
    notes: 'Gold foil accent on front logo.',
  });

  console.log('✓ Demo data seeded.');
}

if (require.main === module) {
  seedDemoDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = seedDemoDatabase;
