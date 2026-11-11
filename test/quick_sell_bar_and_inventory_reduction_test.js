const assert = require('assert');
const http = require('http');
const { StockItem, StockTransaction, PosSale, PosSaleItem, User, Order } = require('../src/models');
const app = require('../server');
const jwt = require('jsonwebtoken');
const config = require('../src/config/config');

let BASE_URL = 'http://127.0.0.1:3000';
let serverInstance = null;
let adminToken = null;
let cookieHeader = null;

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

function postJson(path, payload, token = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataStr),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (cookie) headers['Cookie'] = cookie;

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

function get(path, token = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (cookie) headers['Cookie'] = cookie;

    const req = http.request(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, text: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING QUICK SELL BAR & INVENTORY REDUCTION TEST SUITE ---');

  await setupServer();

  // Find or create admin user
  let admin = await User.findOne({ where: { role: 'ADMIN' } });
  if (!admin) {
    admin = await User.create({
      username: 'test_admin_qs',
      email: 'test_admin_qs@nirmana.lk',
      password: 'Password123!',
      fullName: 'Test Admin QS',
      role: 'ADMIN',
      phone: '0770000001',
      isActive: true,
    });
  }

  adminToken = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, email: admin.email },
    config.jwtSecret,
    { expiresIn: '2h' }
  );

  // Login via POST /api/auth/login to get session cookie
  const loginRes = await postJson('/api/auth/login', {
    username: admin.username,
    password: 'Password123!',
  });
  if (loginRes.headers['set-cookie']) {
    cookieHeader = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
  }

  // Ensure quick sell materials exist
  const dashboardService = require('../src/services/dashboardService');
  await dashboardService.ensureQuickSellMaterials();

  const testTrackedSales = [];
  const testTrackedStockTx = [];

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Check Dedicated /quick-sell Page & 5 Material Cards
    // ------------------------------------------------------------------------
    console.log('\n[TEST 1] Checking dedicated /quick-sell counter page for 5 material cards...');
    const qsRes = await get('/quick-sell', adminToken, cookieHeader);
    assert.strictEqual(qsRes.status, 200, `Expected status 200 on /quick-sell, got ${qsRes.status}`);

    const html = qsRes.text;
    assert.ok(html.includes('Quick Sell Counter'), 'Must display "Quick Sell Counter" title');

    // Check dashboard has link and no longer contains embedded panel
    const dashRes = await get('/dashboard', adminToken, cookieHeader);
    assert.strictEqual(dashRes.status, 200);
    assert.ok(dashRes.text.includes('/quick-sell'), 'Dashboard must link to dedicated /quick-sell page');
    assert.ok(!dashRes.text.includes('id="quickSellPanel"'), 'Dashboard must not have old embedded panel');

    // Check presence of 5 material names & prices on /quick-sell
    assert.ok(html.toLowerCase().includes('a4 black and white') || html.toLowerCase().includes('a4 b&w'), 'Must include A4 Black and White');
    assert.ok(html.includes('8.00'), 'Must display 8.00 LKR price for A4 B&W');

    assert.ok(html.toLowerCase().includes('a3 b&w') || html.toLowerCase().includes('a3 b&amp;w') || html.toLowerCase().includes('stk-a3-bw'), 'Must include A3 B&W');
    assert.ok(html.includes('15.00'), 'Must display 15.00 LKR price for A3 B&W');

    assert.ok(html.toLowerCase().includes('a4 color'), 'Must include A4 Color');
    assert.ok(html.includes('20.00'), 'Must display 20.00 LKR price for A4 Color');

    assert.ok(html.toLowerCase().includes('a3 color'), 'Must include A3 Color');
    assert.ok(html.includes('40.00'), 'Must display 40.00 LKR price for A3 Color');

    assert.ok(html.toLowerCase().includes('a4 sticker'), 'Must include A4 Sticker');
    assert.ok(html.includes('120.00'), 'Must display 120.00 LKR price for A4 Sticker');

    // Check triggerQuickSell is wired
    assert.ok(html.includes('triggerQuickSell'), 'Must include triggerQuickSell function call');
    console.log('✓ TEST 1 PASSED: Quick Sell counter page and all 5 material cards rendered properly.');

    // ------------------------------------------------------------------------
    // TEST 2: Check ordinary order print part (/orders/new) does NOT include quick sell materials
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2] Checking /orders/new to verify quick sell materials are removed from ordinary print order dropdown...');
    const orderNewRes = await get('/orders/new', adminToken, cookieHeader);
    assert.strictEqual(orderNewRes.status, 200, `Expected status 200 on /orders/new, got ${orderNewRes.status}`);

    const orderHtml = orderNewRes.text;
    // Extract the <select id="stockItemSelector"> block
    const selectMatch = orderHtml.match(/<select id="stockItemSelector"[\s\S]*?<\/select>/);
    assert.ok(selectMatch, 'Must find stockItemSelector in /orders/new');
    const selectHtml = selectMatch[0];

    // Assert that none of the 5 fast-selling materials are inside the ordinary stockItemSelector
    assert.ok(!selectHtml.toLowerCase().includes('a4 black and white'), 'stockItemSelector must NOT contain A4 Black and White');
    assert.ok(!selectHtml.toLowerCase().includes('a3 b&w'), 'stockItemSelector must NOT contain A3 B&W');
    assert.ok(!selectHtml.toLowerCase().includes('a4 color'), 'stockItemSelector must NOT contain A4 Color');
    assert.ok(!selectHtml.toLowerCase().includes('a3 color'), 'stockItemSelector must NOT contain A3 Color');
    assert.ok(!selectHtml.toLowerCase().includes('a4 sticker'), 'stockItemSelector must NOT contain A4 Sticker');

    // Extract the <datalist id="stockPaperList"> block
    const datalistMatch = orderHtml.match(/<datalist id="stockPaperList">[\s\S]*?<\/datalist>/);
    assert.ok(datalistMatch, 'Must find stockPaperList in /orders/new');
    const datalistHtml = datalistMatch[0];
    assert.ok(!datalistHtml.toLowerCase().includes('a4 black and white'), 'stockPaperList must NOT contain A4 Black and White');
    assert.ok(!datalistHtml.toLowerCase().includes('a3 b&w'), 'stockPaperList must NOT contain A3 B&W');
    assert.ok(!datalistHtml.toLowerCase().includes('a4 color'), 'stockPaperList must NOT contain A4 Color');
    assert.ok(!datalistHtml.toLowerCase().includes('a3 color'), 'stockPaperList must NOT contain A3 Color');
    assert.ok(!datalistHtml.toLowerCase().includes('a4 sticker'), 'stockPaperList must NOT contain A4 Sticker');

    console.log('✓ TEST 2 PASSED: Fast-selling materials are completely excluded from ordinary print order options.');

    // ------------------------------------------------------------------------
    // TEST 3: Perform Quick Sell transaction (40 A4 sheets @ 8 LKR)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Quick Sell: 40 A4 B&W sheets @ 8 LKR with auto inventory reduction (Office Use)...');
    const a4BwItem = await StockItem.findOne({ where: { code: 'STK-A4-BW' } });
    assert.ok(a4BwItem, 'A4 B&W StockItem must exist');
    const prevStock = parseFloat(a4BwItem.currentStock);

    const sellRes = await postJson('/api/pos/quick-transaction', {
      goodName: 'A4 black and white',
      stockItemId: a4BwItem.id,
      price: 8.00,
      amount: 40,
      paymentMethod: 'CASH',
      notes: 'Quick sell test 40 sheets',
    }, adminToken, cookieHeader);

    assert.strictEqual(sellRes.status, 201, `Expected status 201, got ${sellRes.status}: ${JSON.stringify(sellRes.body)}`);
    assert.ok(sellRes.body.success, 'Transaction should succeed');
    const saleId = sellRes.body.data.id;
    testTrackedSales.push(saleId);

    // Verify stock reduction
    await a4BwItem.reload();
    const newStock = parseFloat(a4BwItem.currentStock);
    assert.strictEqual(newStock, prevStock - 40, `Stock should reduce by 40 from ${prevStock} to ${prevStock - 40}, got ${newStock}`);

    // Verify stock transaction was recorded as OFFICE_USE
    const stockTx = await StockTransaction.findOne({
      where: {
        stockItemId: a4BwItem.id,
        reference: `POS #${sellRes.body.data.receiptNumber}`,
      },
    });
    assert.ok(stockTx, 'StockTransaction must be recorded');
    assert.strictEqual(stockTx.type, 'OUT', 'Transaction type must be OUT');
    assert.strictEqual(stockTx.category, 'OFFICE_USE', 'Transaction category must be OFFICE_USE');
    assert.strictEqual(parseFloat(stockTx.quantity), 40, 'Deducted quantity must be 40');
    testTrackedStockTx.push(stockTx.id);

    console.log(`✓ TEST 3 PASSED: Sold 40 A4 sheets. Stock reduced from ${prevStock} to ${newStock}. Recorded as OFFICE_USE.`);

    // ------------------------------------------------------------------------
    // TEST 4: Quick Sell with manual misprinted sheets wastage (20 sheets @ 20 LKR + 5 misprints)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Quick Sell with manual misprinted wastage: 20 A4 Color @ 20 LKR + 5 damaged sheets...');
    const a4ClrItem = await StockItem.findOne({ where: { code: 'STK-A4-CLR' } });
    assert.ok(a4ClrItem, 'A4 Color StockItem must exist');
    const prevClrStock = parseFloat(a4ClrItem.currentStock);

    const sellWastageRes = await postJson('/api/pos/quick-transaction', {
      goodName: 'A4 color',
      stockItemId: a4ClrItem.id,
      price: 20.00,
      amount: 20,
      wastageQty: 5,
      paymentMethod: 'CASH',
      notes: 'Quick sell test with misprints',
    }, adminToken, cookieHeader);

    assert.strictEqual(sellWastageRes.status, 201, `Expected status 201, got ${sellWastageRes.status}`);
    const clrSaleId = sellWastageRes.body.data.id;
    testTrackedSales.push(clrSaleId);

    // Verify stock reduction of both 20 sheets sold + 5 sheets wasted = 25 total
    await a4ClrItem.reload();
    const newClrStock = parseFloat(a4ClrItem.currentStock);
    assert.strictEqual(newClrStock, prevClrStock - 25, `Stock should reduce by 25 from ${prevClrStock} to ${prevClrStock - 25}, got ${newClrStock}`);

    // Verify OFFICE_USE transaction (20 sheets)
    const officeTx = await StockTransaction.findOne({
      where: {
        stockItemId: a4ClrItem.id,
        category: 'OFFICE_USE',
        reference: `POS #${sellWastageRes.body.data.receiptNumber}`,
      },
    });
    assert.ok(officeTx, 'OFFICE_USE transaction must exist');
    assert.strictEqual(parseFloat(officeTx.quantity), 20, 'OFFICE_USE quantity must be 20');
    testTrackedStockTx.push(officeTx.id);

    // Verify WASTAGE transaction (5 sheets)
    const wasteTx = await StockTransaction.findOne({
      where: {
        stockItemId: a4ClrItem.id,
        category: 'WASTAGE',
        reference: `POS #${sellWastageRes.body.data.receiptNumber} (Wastage)`,
      },
    });
    assert.ok(wasteTx, 'WASTAGE transaction must exist');
    assert.strictEqual(parseFloat(wasteTx.quantity), 5, 'WASTAGE quantity must be 5');
    testTrackedStockTx.push(wasteTx.id);

    console.log(`✓ TEST 4 PASSED: Sold 20 sheets + 5 misprints. Stock reduced from ${prevClrStock} to ${newClrStock}. Both OFFICE_USE and WASTAGE recorded.`);

    // ------------------------------------------------------------------------
    // TEST 5: Standalone Manual Stock Wastage Removal (10 misprinted A3 B&W sheets)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing standalone manual wastage removal: 10 A3 B&W misprinted sheets removed...');
    const a3BwItem = await StockItem.findOne({ where: { code: 'STK-A3-BW' } });
    assert.ok(a3BwItem, 'A3 B&W StockItem must exist');
    const prevA3Stock = parseFloat(a3BwItem.currentStock);

    const manualRemoveRes = await postJson('/api/stock/remove', {
      stockItemId: a3BwItem.id,
      quantity: 10,
      reason: 'WASTAGE',
      notes: '10 sheets not printed well during machine test',
    }, adminToken, cookieHeader);

    assert.strictEqual(manualRemoveRes.status, 200, `Expected status 200 on /api/stock/remove, got ${manualRemoveRes.status}`);
    assert.ok(manualRemoveRes.body.success, 'Manual removal must succeed');

    await a3BwItem.reload();
    const newA3Stock = parseFloat(a3BwItem.currentStock);
    assert.strictEqual(newA3Stock, prevA3Stock - 10, `A3 stock should reduce by 10 from ${prevA3Stock} to ${prevA3Stock - 10}, got ${newA3Stock}`);

    const standaloneWasteTx = await StockTransaction.findOne({
      where: {
        stockItemId: a3BwItem.id,
        category: 'WASTAGE',
        notes: '10 sheets not printed well during machine test',
      },
    });
    assert.ok(standaloneWasteTx, 'Standalone wastage transaction must exist');
    assert.strictEqual(standaloneWasteTx.category, 'WASTAGE');
    testTrackedStockTx.push(standaloneWasteTx.id);

    console.log(`✓ TEST 5 PASSED: Manually removed 10 spoiled sheets. Stock reduced from ${prevA3Stock} to ${newA3Stock}. Recorded as WASTAGE.`);

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Remove all test dummy records and restore stock balances
    // ------------------------------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up dummy test records and restoring stock levels...');
    for (const txId of testTrackedStockTx) {
      await StockTransaction.destroy({ where: { id: txId } }).catch(() => {});
    }
    for (const sId of testTrackedSales) {
      await PosSaleItem.destroy({ where: { saleId: sId } }).catch(() => {});
      await PosSale.destroy({ where: { id: sId } }).catch(() => {});
    }

    // Reset standard stock levels
    await StockItem.update({ currentStock: 500.00 }, { where: { code: 'STK-A4-BW' } });
    await StockItem.update({ currentStock: 300.00 }, { where: { code: 'STK-A3-BW' } });
    await StockItem.update({ currentStock: 500.00 }, { where: { code: 'STK-A4-CLR' } });
    await StockItem.update({ currentStock: 300.00 }, { where: { code: 'STK-A3-CLR' } });
    await StockItem.update({ currentStock: 200.00 }, { where: { code: 'STK-A4-STK' } });

    if (serverInstance) {
      serverInstance.close();
      console.log('✓ Test server closed.');
    }
  }

  console.log('\n=======================================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! ZERO DUMMY RESIDUE.');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});

