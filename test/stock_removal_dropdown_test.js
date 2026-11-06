const assert = require('assert');
const http = require('http');
const { StockItem, StockTransaction } = require('../src/models');

const BASE_URL = 'http://localhost:3000';

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

async function runStockRemovalDropdownTest() {
  console.log('===============================================================');
  console.log('🧪 VERIFYING STOCK REMOVAL DROPDOWN POPULATION & DEDUCTION');
  console.log('===============================================================');

  // Step 1: Admin Authentication
  console.log('\n1. Authenticating as Admin...');
  const loginRes = await postJson('/api/auth/login', {
    username: 'admin',
    password: 'Password123!',
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const token = loginRes.body.data.token;
  console.log('   ✓ Logged in as Admin successfully.');

  // Step 2: Verify HTML Rendering of /stock
  console.log('\n2. Verifying /stock page renders preloaded stock data & remove modal...');
  const stockPageRes = await get('/stock', token);
  assert.strictEqual(stockPageRes.status, 200, '/stock page should return HTTP 200');
  const html = stockPageRes.body;

  // Verify modal exists
  assert.ok(html.includes('id="stockRemoveModal"'), 'HTML must include #stockRemoveModal');
  assert.ok(html.includes('id="stockRemoveSelect"'), 'HTML must include #stockRemoveSelect');
  assert.ok(html.includes('window._preloadedStockItems ='), 'HTML must include window._preloadedStockItems definition');
  assert.ok(html.includes("e.target.id === 'stockRemoveModal'"), 'HTML must include modal listener for stockRemoveModal');

  // Verify preloaded stock items are not empty
  const preloadMatch = html.match(/window\._preloadedStockItems = (\[.*?\]);/s);
  assert.ok(preloadMatch, 'Should find preloaded stock items array in HTML');
  const preloadedItems = JSON.parse(preloadMatch[1]);
  assert.ok(Array.isArray(preloadedItems) && preloadedItems.length > 0, `Preloaded items should not be empty (found ${preloadedItems.length} items)`);
  console.log(`   ✓ Found ${preloadedItems.length} items preloaded for dropdown menus.`);
  console.log(`   ✓ Sample preloaded item: ${preloadedItems[0].name} (Stock: ${preloadedItems[0].currentStock} ${preloadedItems[0].unit})`);

  // Step 3: Verify GET /api/stock endpoint returns items
  console.log('\n3. Verifying GET /api/stock API returns items for fallback lazy-loading...');
  const apiStockRes = await get('/api/stock', token);
  assert.strictEqual(apiStockRes.status, 200, 'GET /api/stock should return HTTP 200');
  const apiStockJson = JSON.parse(apiStockRes.body);
  assert.ok(apiStockJson.success && Array.isArray(apiStockJson.data), 'API stock response must be array');
  assert.ok(apiStockJson.data.length > 0, 'API stock items must not be empty');
  console.log(`   ✓ GET /api/stock returned ${apiStockJson.data.length} active inventory items.`);

  // Step 4: Pick a stock item for testing stock removal
  console.log('\n4. Selecting a stock item to test removal deduction...');
  // Find an item with stock > 5, or create/top-up one
  let targetItem = apiStockJson.data.find(i => parseFloat(i.currentStock) >= 10);
  if (!targetItem) {
    // Create temporary item
    const created = await StockItem.create({
      code: 'TEST-REM-' + Date.now().toString().slice(-4),
      name: 'Test Removal Cardstock 300gsm',
      category: 'Paper / Substrate',
      unit: 'Sheets',
      currentStock: 50,
      minStockAlert: 5,
      unitCost: 15.00,
      sellingPrice: 35.00,
      isActive: true,
    });
    targetItem = created.toJSON();
  }

  const initialStock = parseFloat(targetItem.currentStock);
  console.log(`   ✓ Using stock item: "${targetItem.name}" (ID: ${targetItem.id}, Current: ${initialStock} ${targetItem.unit})`);

  // Step 5: Test boundary condition - remove more than available
  console.log('\n5. Testing boundary validation: Attempting to remove excessive quantity...');
  const excessiveRemoval = await postJson('/api/stock/remove', {
    stockItemId: targetItem.id,
    quantity: initialStock + 1000,
    reason: 'DAMAGED',
    reference: 'TEST-OVER-LIMIT',
  }, token);
  assert.strictEqual(excessiveRemoval.status, 400, 'Over-limit removal should return HTTP 400 Bad Request');
  assert.ok(excessiveRemoval.body.message.includes('available in stock'), 'Error message should warn about available stock');
  console.log(`   ✓ Excessive removal correctly blocked: "${excessiveRemoval.body.message}"`);

  // Step 6: Test legitimate stock removal
  console.log('\n6. Testing legitimate stock removal (2 units for DAMAGED)...');
  const removeQty = 2;
  const removalRef = 'INCIDENT-DMG-' + Date.now().toString().slice(-4);
  const removalReason = 'DAMAGED';
  const removalNotes = 'Tested via automated verification: 2 units damaged during print setup';

  const removeRes = await postJson('/api/stock/remove', {
    stockItemId: targetItem.id,
    quantity: removeQty,
    reason: removalReason,
    reference: removalRef,
    notes: removalNotes,
    date: '2026-11-06',
  }, token);

  assert.strictEqual(removeRes.status, 200, 'Stock removal should return HTTP 200');
  assert.strictEqual(removeRes.body.success, true, 'Stock removal should report success');
  console.log(`   ✓ API Response: ${removeRes.body.message}`);

  // Step 7: Verify Database changes directly
  console.log('\n7. Verifying inventory balance & transaction log in Database...');
  const updatedItem = await StockItem.findByPk(targetItem.id);
  const expectedStock = initialStock - removeQty;
  assert.strictEqual(parseFloat(updatedItem.currentStock), expectedStock, `Stock should decrease from ${initialStock} to ${expectedStock}`);
  console.log(`   ✓ Item currentStock correctly reduced: ${initialStock} -> ${updatedItem.currentStock} ${updatedItem.unit}`);

  const tx = await StockTransaction.findOne({
    where: {
      stockItemId: targetItem.id,
      reference: removalRef,
    },
  });
  assert.ok(tx, 'StockTransaction record must be logged');
  assert.strictEqual(tx.type, 'OUT', 'Transaction type must be OUT');
  assert.strictEqual(tx.category, 'DAMAGED', 'Transaction category must match reason DAMAGED');
  assert.strictEqual(parseFloat(tx.quantity), removeQty, 'Transaction quantity must be 2');
  assert.strictEqual(parseFloat(tx.balanceAfter), expectedStock, 'balanceAfter must match new stock balance');
  console.log(`   ✓ Logged StockTransaction #${tx.id}: Type=${tx.type}, Category=${tx.category}, BalanceAfter=${tx.balanceAfter}, LossValuation=Rs. ${tx.totalCost}`);

  // Step 8: Verify Removed Stock Ledger UI Tab (/stock?tab=removed)
  console.log('\n8. Verifying Removed Stock Ledger tab renders the removal entry...');
  const removedPageRes = await get('/stock?tab=removed', token);
  assert.strictEqual(removedPageRes.status, 200, 'GET /stock?tab=removed should return HTTP 200');
  assert.ok(removedPageRes.body.includes(removalRef), 'Removed Ledger page must display the incident reference');
  assert.ok(removedPageRes.body.includes('Damaged / Broken') || removedPageRes.body.includes('DAMAGED'), 'Removed Ledger must display DAMAGED badge');
  console.log(`   ✓ /stock?tab=removed successfully displays transaction reference "${removalRef}".`);

  // Step 9: Re-credit the test item so test does not deplete active operational stock
  console.log('\n9. Restoring the 2 test units to maintain accurate stock records...');
  await postJson('/api/stock/in', {
    stockItemId: targetItem.id,
    quantity: removeQty,
    unitCost: targetItem.unitCost || 0,
    reference: 'TEST-RESTORE-' + removalRef,
    notes: 'Restored 2 units from automated verification test',
  }, token);

  const restoredItem = await StockItem.findByPk(targetItem.id);
  assert.strictEqual(parseFloat(restoredItem.currentStock), initialStock, 'Stock should be restored back to initial level');
  console.log(`   ✓ Item restored back to ${restoredItem.currentStock} ${restoredItem.unit}.`);

  console.log('\n===============================================================');
  console.log('✅ ALL STOCK REMOVAL TESTS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================');
}

runStockRemovalDropdownTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
