const assert = require('assert');
const { ROLES, normalizeRole, isStaff, isAdmin, isCustomer } = require('../src/constants/roles');
const posService = require('../src/services/posService');
const dashboardService = require('../src/services/dashboardService');
const orderService = require('../src/services/orderService');
const productService = require('../src/services/productService');
const { User, Customer, Order, PosSale, PosSaleItem, StockItem } = require('../src/models');
const { getSriLankaTodayString } = require('../src/utils/dateUtils');

async function runTests() {
  console.log('--- STARTING VERIFICATION TEST ---');

  // Test 1: Verify 4 Roles & Helpers
  console.log('1. Testing 4-Role Model & SOLID helpers...');
  assert.strictEqual(ROLES.ADMIN, 'ADMIN');
  assert.strictEqual(ROLES.WORKER, 'WORKER');
  assert.strictEqual(ROLES.CUSTOMER, 'CUSTOMER');
  assert.strictEqual(ROLES.GUEST, 'GUEST');

  assert.strictEqual(normalizeRole('ADMIN'), 'ADMIN');
  assert.strictEqual(normalizeRole('OWNER'), 'ADMIN');
  assert.strictEqual(normalizeRole('WORKER'), 'WORKER');
  assert.strictEqual(normalizeRole('STAFF'), 'WORKER');
  assert.strictEqual(normalizeRole('PRODUCTION'), 'WORKER');
  assert.strictEqual(normalizeRole('CUSTOMER'), 'CUSTOMER');
  assert.strictEqual(normalizeRole('GUEST'), 'GUEST');

  assert.strictEqual(isAdmin('ADMIN'), true);
  assert.strictEqual(isAdmin('WORKER'), false);
  assert.strictEqual(isStaff('WORKER'), true);
  assert.strictEqual(isStaff('ADMIN'), true);
  assert.strictEqual(isStaff('CUSTOMER'), false);
  assert.strictEqual(isStaff('GUEST'), false);
  console.log('   ✓ 4-Role constants and permissions passed.');

  // Test 2: Unified Product Catalog Service
  console.log('2. Testing Product Catalog Service (Physical Stock & Print Services)...');
  const catalogResult = await productService.getAllCatalogProducts();
  assert(catalogResult && Array.isArray(catalogResult.products), 'Catalog must return products array');
  assert(catalogResult.products.length > 0, 'Catalog should contain products');
  const sample = catalogResult.products[0];
  assert(sample.id !== undefined, 'Product must have an id');
  assert(sample.name !== undefined, 'Product must have a name');
  assert(sample.unitPrice !== undefined, 'Product must have a unitPrice');
  console.log(`   ✓ Catalog returned ${catalogResult.products.length} items. Sample: "${sample.name}" @ Rs. ${sample.unitPrice}`);

  // Test 3: Admin & Worker Accounts
  console.log('3. Checking Admin & Worker test accounts...');
  let adminUser = await User.findOne({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    adminUser = await User.create({
      username: 'testadmin_' + Date.now(),
      email: `admin_${Date.now()}@test.com`,
      password: 'password123',
      fullName: 'Store Owner',
      role: 'ADMIN',
    });
  }

  let workerUser = await User.findOne({ where: { role: 'WORKER' } });
  if (!workerUser) {
    workerUser = await User.create({
      username: 'testworker_' + Date.now(),
      email: `worker_${Date.now()}@test.com`,
      password: 'password123',
      fullName: 'Counter Worker',
      role: 'WORKER',
    });
  }
  assert(adminUser && adminUser.id, 'Admin user must exist');
  assert(workerUser && workerUser.id, 'Worker user must exist');
  console.log(`   ✓ Admin: ${adminUser.fullName || adminUser.username} (${adminUser.role}), Worker: ${workerUser.fullName || workerUser.username} (${workerUser.role})`);

  // Test 4: Quick Transaction without Customer Profile
  console.log('4. Testing Quick Transaction WITHOUT customer profile...');
  const testGoodName = '10x12 Wooden Photo Frame Glass Finish';
  const testPrice = 1250.00;
  const testAmount = 2; // quantity
  const testTotal = testPrice * testAmount;

  // Simulate posController.createQuickTransaction behavior
  const posPayload = {
    customerName: 'Walk-in Customer (No Profile)',
    customerId: null,
    customerPhone: null,
    items: [
      {
        name: testGoodName,
        unitPrice: testPrice,
        quantity: testAmount,
        totalPrice: testTotal,
      }
    ],
    subtotal: testTotal,
    discount: 0,
    totalAmount: testTotal,
    amountTendered: testTotal,
    paymentMethod: 'CASH',
    notes: 'Direct counter transaction without customer profile',
  };

  const sale = await posService.createSale(posPayload, workerUser.id);
  assert(sale, 'Sale must be created');
  assert.strictEqual(sale.customerId, null, 'customerId must be null for profile-less transaction');
  assert.strictEqual(parseFloat(sale.totalAmount), testTotal, 'Total must match calculation');
  assert.strictEqual(sale.cashierId, workerUser.id, 'Cashier must be the worker');
  console.log(`   ✓ Quick Sale recorded: Receipt #${sale.receiptNumber}, Total: Rs. ${sale.totalAmount}, Cashier: Worker #${sale.cashierId}`);

  // Test 5: Verify Quick Transaction in Dashboard Daily Logger
  console.log('5. Verifying Daily Logger updates...');
  const todayStr = getSriLankaTodayString();
  const dashboardData = await dashboardService.getDashboardStats(todayStr);
  assert(dashboardData.dailyBusiness, 'Daily business must exist in dashboard data');
  assert(dashboardData.dailyBusiness.posSalesCount > 0, 'posSalesCount must be > 0');
  assert(dashboardData.dailyBusiness.posTotalRevenue >= testTotal, 'Revenue must include test sale');

  // Verify the sale is in todayPosSales with items and cashier
  const foundSale = dashboardData.dailyBusiness.todayPosSales.find(s => s.id === sale.id);
  assert(foundSale, 'Recorded sale must be in todayPosSales list');
  assert(foundSale.items && foundSale.items.length > 0, 'Sale items must be populated in daily logger');
  assert.strictEqual(foundSale.items[0].itemName, testGoodName);
  assert.strictEqual(parseFloat(foundSale.items[0].quantity), testAmount);
  assert.strictEqual(parseFloat(foundSale.items[0].unitPrice), testPrice);
  assert(foundSale.cashier, 'Cashier must be loaded');
  assert.strictEqual(foundSale.cashier.fullName, workerUser.fullName);
  console.log(`   ✓ Daily logger verified: Sale #${foundSale.receiptNumber} with "${foundSale.items[0].itemName}" (${foundSale.items[0].quantity} @ Rs. ${foundSale.items[0].unitPrice}) cashiered by ${foundSale.cashier.fullName}`);

  // Test 6: Walk-in Order without Customer Profile
  console.log('6. Testing Walk-in Order intake without Customer Profile...');
  const order = await orderService.createOrder({
    customerId: null,
    jobTitle: 'Walk-in Urgent Mug Printing',
    paperMaterial: 'Ceramic Mug Substrate',
    specifications: 'Color photo wrap',
    quantity: 1,
    subtotal: 950.00,
    discount: 0,
    totalAmount: 950.00,
    advancePaid: 950.00,
    status: 'RECEIVED',
    notes: 'Walk-in customer paid in full at counter',
  });
  assert(order, 'Order must be created');
  assert.strictEqual(order.customerId, null, 'customerId must be null for walk-in order');
  assert.strictEqual(parseFloat(order.totalAmount), 950.00);
  console.log(`   ✓ Walk-in Order created: ${order.orderNumber} without customer profile`);

  console.log('\n========================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
