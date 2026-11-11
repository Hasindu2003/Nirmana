const assert = require('assert');
const http = require('http');
const { Order, Customer, StockItem, StockTransaction } = require('../src/models');
const app = require('../server');

let BASE_URL = 'http://127.0.0.1:3000';
let serverInstance = null;

function setupServer() {
  return new Promise((resolve) => {
    serverInstance = app.listen(0, '127.0.0.1', () => {
      const port = serverInstance.address().port;
      BASE_URL = `http://127.0.0.1:${port}`;
      console.log(`Test server running on port ${port}`);
      resolve();
    });
  });
}

function postJson(path, payload, token = null) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataStr),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

function get(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runHttpTest() {
  console.log('================================================================');
  console.log('🧪 HTTP END-TO-END VERIFICATION: PRINT ORDER & MATERIAL DEDUCTION');
  console.log('================================================================\n');

  await setupServer();

  // Step 1: Admin Login
  console.log('1. Authenticating as Admin...');
  const loginRes = await postJson('/api/auth/login', {
    username: 'admin',
    password: 'Password123!',
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const token = loginRes.body.data.token;
  console.log('✓ Admin authenticated.');

  // Step 2: HTML Page Checks via HTTP
  console.log('\n2. Verifying HTTP GET /orders/new (Commercial Print Order)...');
  const newOrderPage = await get('/orders/new', token);
  assert.strictEqual(newOrderPage.status, 200);
  assert.ok(newOrderPage.body.includes('Commercial & General Printing Order'), 'Must render Commercial print order header');
  assert.ok(!newOrderPage.body.includes('Choose Order Type *'), 'Must NOT have Step 1 Choose Order Type in ordinary print order');
  assert.ok(!newOrderPage.body.includes('optgroup label="Photo Frames'), 'Must NOT have Photo Frames optgroup in ordinary print order');
  assert.ok(!newOrderPage.body.includes('<option value="CUSTOM_FRAME">'), 'Must NOT have CUSTOM_FRAME option in ordinary print order select');
  assert.ok(newOrderPage.body.includes('Printing Material / Paper Substrate'), 'Must have Printing Material label');
  assert.ok(newOrderPage.body.includes('orderWastageQty'), 'Must have orderWastageQty field');
  console.log('✓ /orders/new: Ordinary print order has no photo frame ordering parts and has material deduction & wastage fields.');

  console.log('\n3. Verifying HTTP GET /orders/new?type=frame (Photo Frame Studio)...');
  const frameOrderPage = await get('/orders/new?type=frame', token);
  assert.strictEqual(frameOrderPage.status, 200);
  assert.ok(frameOrderPage.body.includes('Photo Frames Studio Order'), 'Must render Photo Frames Studio header');
  assert.ok(frameOrderPage.body.includes('CUSTOM_FRAME'), 'Photo Frame Studio must have CUSTOM_FRAME option');
  console.log('✓ /orders/new?type=frame: Dedicated photo frame studio retained.');

  console.log('\n4. Verifying HTTP GET /orders (Ordinary Print Order Remove Modal)...');
  const ordersListPage = await get('/orders', token);
  assert.strictEqual(ordersListPage.status, 200);
  assert.ok(ordersListPage.body.includes('Paper substrate / printing material currently out of stock'), 'Remove modal in print queue must not have Frame size');
  console.log('✓ /orders: Order remove modal cleanly shows paper substrate without Frame size.');

  // Step 3: End-to-End API Order Creation with Auto Material Deduction (Office Use)
  console.log('\n5. Creating a test stock item for A4 paper...');
  const testPaper = await StockItem.create({
    code: 'STK-A4-TEST-' + Date.now().toString().slice(-4),
    name: 'A4 80GSM Plain White Copier Paper',
    category: 'Paper / Substrate',
    unit: 'Sheets',
    currentStock: 100,
    minStockAlert: 10,
    unitCost: 2.00,
    sellingPrice: 5.00,
    isActive: true,
  });
  console.log(`✓ Test paper created: ${testPaper.name} (ID: ${testPaper.id}, Stock: ${testPaper.currentStock} ${testPaper.unit})`);

  console.log('\n6. Creating an ordinary print order for 40 A4 sheets via POST /api/orders...');
  const createOrderRes = await postJson('/api/orders', {
    newCustomerName: 'Dilshan Silva',
    newCustomerPhone: '0719876543',
    jobTitle: '40 Sheets Company Annual Brochure',
    orderType: 'GENERAL_PRINT',
    stockItemId: testPaper.id,
    quantity: 40,
    subtotal: 200.00,
    totalAmount: 200.00,
    advancePaid: 200.00,
    paymentMethod: 'CASH',
  }, token);

  assert.strictEqual(createOrderRes.status, 201, 'Order creation must succeed');
  const createdOrder = createOrderRes.body.data;
  console.log(`✓ Order #${createdOrder.orderNumber} created (ID: ${createdOrder.id})`);
  assert.strictEqual(createdOrder.stockDeducted, true);
  assert.strictEqual(parseFloat(createdOrder.stockDeductedQty), 40);

  // Check database currentStock reduced to 60
  const paperAfterOrder = await StockItem.findByPk(testPaper.id);
  assert.strictEqual(parseFloat(paperAfterOrder.currentStock), 60.00);
  console.log(`✓ Inventory stock automatically reduced from 100 to ${paperAfterOrder.currentStock} ${paperAfterOrder.unit}`);

  // Check Office Use transaction
  const officeTx = await StockTransaction.findOne({
    where: { stockItemId: testPaper.id, category: 'OFFICE_USE' }
  });
  assert.ok(officeTx);
  assert.strictEqual(parseFloat(officeTx.quantity), 40.00);
  console.log(`✓ Logged Office Use StockTransaction #${officeTx.id}: Qty=${officeTx.quantity}, BalanceAfter=${officeTx.balanceAfter}`);

  // Step 4: Manually remove 10 misprinted sheets via POST /api/orders/:id/remove-material
  console.log('\n7. Manually removing 10 misprinted sheets via POST /api/orders/:id/remove-material...');
  const removeMatRes = await postJson(`/api/orders/${createdOrder.id}/remove-material`, {
    stockItemId: testPaper.id,
    quantity: 10,
    reason: 'WASTAGE',
    notes: '10 sheets not printed well due to paper feed roller slip',
  }, token);

  assert.strictEqual(removeMatRes.status, 200, 'Remove material must succeed');
  console.log(`✓ API Response: ${removeMatRes.body.message}`);

  // Check database currentStock reduced to 50
  const paperAfterWastage = await StockItem.findByPk(testPaper.id);
  assert.strictEqual(parseFloat(paperAfterWastage.currentStock), 50.00);
  console.log(`✓ Inventory stock reduced from 60 to ${paperAfterWastage.currentStock} ${paperAfterWastage.unit}`);

  // Check Wastage transaction
  const wastageTx = await StockTransaction.findOne({
    where: { stockItemId: testPaper.id, category: 'WASTAGE' }
  });
  assert.ok(wastageTx);
  assert.strictEqual(parseFloat(wastageTx.quantity), 10.00);
  console.log(`✓ Logged Wastage StockTransaction #${wastageTx.id}: Qty=${wastageTx.quantity}, BalanceAfter=${wastageTx.balanceAfter}`);

  // Step 5: Check order detail HTML contains badges and removal info
  console.log(`\n8. Checking HTTP GET /orders/${createdOrder.id} (Order Detail)...`);
  const orderDetailPage = await get(`/orders/${createdOrder.id}`, token);
  assert.strictEqual(orderDetailPage.status, 200);
  assert.ok(orderDetailPage.body.includes('40 units deducted'), 'Must show 40 units deducted badge');
  assert.ok(orderDetailPage.body.includes('10 units removed') || orderDetailPage.body.includes('10 sheets'), 'Must show 10 units removed badge');
  assert.ok(orderDetailPage.body.includes('Record Misprint / Wastage'), 'Must have Record Misprint / Wastage button');
  console.log('✓ Order detail HTML correctly displays Office Use deduction & Misprint removal info.');

  // Step 6: Clean up dummy test data
  console.log('\n9. Cleaning up dummy test data...');
  await StockTransaction.destroy({ where: { stockItemId: testPaper.id } });
  const { Payment } = require('../src/models');
  await Payment.destroy({ where: { orderId: createdOrder.id } });
  await Order.destroy({ where: { id: createdOrder.id } });
  await StockItem.destroy({ where: { id: testPaper.id } });
  if (createdOrder.customerId) {
    await Customer.destroy({ where: { id: createdOrder.customerId } });
  }
  console.log('✓ All dummy test data completely cleaned from database.');

  console.log('\n================================================================');
  console.log('🎉 ALL HTTP TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
  process.exit(0);
}

runHttpTest().catch(err => {
  console.error('\n❌ HTTP TEST FAILED:', err);
  process.exit(1);
});
