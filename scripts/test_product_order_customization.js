const assert = require('assert');
const http = require('http');
const app = require('../server');
const { sequelize, User, Customer, Order, QuickPrintJob, StockItem } = require('../src/models');
const authService = require('../src/services/authService');

async function runTests() {
  console.log('--- STARTING PRODUCT & ORDER CUSTOMIZATION TESTS ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running on ${baseUrl}`);

  try {
    // 1. Create a test customer account
    const testPhone = '0778887777';
    await User.destroy({ where: { phone: testPhone } }).catch(() => {});
    await Customer.destroy({ where: { phone: testPhone } }).catch(() => {});

    // Create a stock item: Mug Printing with Custom Photo
    let mugItem = await StockItem.findOne({ where: { name: 'White Ceramic Photo Mug' } });
    if (!mugItem) {
      mugItem = await StockItem.create({
        code: 'MUG-001',
        name: 'White Ceramic Photo Mug',
        category: 'Merchandise & Gifts',
        unit: 'Pcs',
        sizeLabel: '11oz Ceramic Mug',
        unitCost: 450.00,
        sellingPrice: 850.00,
        currentStock: 25,
        reorderLevel: 5,
        supplierName: 'Direct Import',
        isActive: true,
      });
    }

    // Register a test customer with bypass flag for test
    process.env.ALLOW_UNVERIFIED_SIGNUP = 'true';
    const regResult = await authService.registerCustomer({
      fullName: 'Kamal Silva',
      phone: testPhone,
      username: 'kamal_' + Date.now().toString().slice(-4),
      password: 'Password123!',
      email: 'kamal@example.com',
    });
    const customerToken = regResult.token;

    console.log('✓ Registered customer account for Kamal Silva');

    // 2. Place an order for "White Ceramic Photo Mug" with custom photo specifications
    console.log('\n2. Testing Online Order Submission for Mug Printing with Custom Photo...');
    const orderRes = await fetch(`${baseUrl}/api/orders/online-guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`,
        'Cookie': `auth_token=${customerToken}`,
      },
      body: JSON.stringify({
        productName: 'White Ceramic Photo Mug',
        productType: 'Custom Merchandise',
        category: 'Merchandise & Gifts',
        paperMaterial: '11oz Ceramic Mug',
        quantity: 2,
        unitPrice: 850.00,
        specifications: 'Print baby photo on front center with caption: "Happy 1st Birthday Liam"',
      }),
    });

    assert.strictEqual(orderRes.status, 201);
    const orderData = await orderRes.json();
    assert.strictEqual(orderData.success, true);
    const createdOrder = orderData.data;

    console.log('✓ Created Order #:', createdOrder.orderNumber);
    console.log('  Job Title     :', createdOrder.jobTitle);
    console.log('  Good/Material :', createdOrder.paperMaterial);
    console.log('  Specifications:', createdOrder.specifications);

    // Verify paperMaterial is NOT null and NOT A4
    assert.strictEqual(createdOrder.jobTitle, 'White Ceramic Photo Mug');
    assert.strictEqual(createdOrder.paperMaterial, '11oz Ceramic Mug');
    assert.ok(createdOrder.specifications.includes('Happy 1st Birthday Liam'));

    // 3. Test Admin Orders List rendering
    console.log('\n3. Testing Admin Orders View Rendering (/orders)...');
    // Admin login or admin cookie
    const adminUser = await User.findOne({ where: { role: 'ADMIN' } });
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/config');
    const adminToken = jwt.sign(
      { id: adminUser.id, username: adminUser.username, role: 'ADMIN' },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    const adminOrdersRes = await fetch(`${baseUrl}/orders`, {
      headers: { Cookie: `auth_token=${adminToken}` },
    });
    assert.strictEqual(adminOrdersRes.status, 200);
    const adminHtml = await adminOrdersRes.text();

    // Verify admin HTML contains the mug title, the material badge, and the custom specifications
    assert.ok(adminHtml.includes('White Ceramic Photo Mug'), 'Admin view must show Mug product name');
    assert.ok(adminHtml.includes('11oz Ceramic Mug'), 'Admin view must show 11oz Ceramic Mug material badge');
    assert.ok(adminHtml.includes('Happy 1st Birthday Liam'), 'Admin view must show customer photo specifications');
    console.log('✓ Admin Orders page (/orders) clearly shows Product Name, Material/Good Type badge, and Custom Instructions!');

    // 4. Test Customer Portal View rendering
    console.log('\n4. Testing Customer Portal View Rendering (/portal)...');
    const portalRes = await fetch(`${baseUrl}/portal`, {
      headers: { Cookie: `auth_token=${customerToken}` },
    });
    assert.strictEqual(portalRes.status, 200);
    const portalHtml = await portalRes.text();

    assert.ok(portalHtml.includes('White Ceramic Photo Mug'), 'Customer portal must show product name');
    assert.ok(portalHtml.includes('11oz Ceramic Mug'), 'Customer portal must show 11oz Ceramic Mug badge');
    assert.ok(portalHtml.includes('Happy 1st Birthday Liam'), 'Customer portal must show customer photo specifications');
    console.log('✓ Customer Portal (/portal) clearly displays Product Name, Material Type, and Custom Specifications!');

    // Clean up
    await Order.destroy({ where: { id: createdOrder.id } }).catch(() => {});
    await User.destroy({ where: { phone: testPhone } }).catch(() => {});
    await Customer.destroy({ where: { phone: testPhone } }).catch(() => {});
    await StockItem.destroy({ where: { code: 'MUG-001' } }).catch(() => {});
    console.log('\n✓ Temporary test records cleaned up.');

    console.log('\n=======================================================');
    console.log('🎉 ALL PRODUCT & ORDER CUSTOMIZATION TESTS PASSED!');
    console.log('=======================================================');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
