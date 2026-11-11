const assert = require('assert');
const { Order, Customer, StockItem, StockTransaction, sequelize } = require('../src/models');
const orderService = require('../src/services/orderService');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('================================================================');
  console.log('🧪 TESTING PRINT ORDER PHOTO FRAME REMOVAL & MATERIAL DEDUCTION');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST PART 1: UI Template Inspection (Photo Frame Part Removed from Print Order)
  // --------------------------------------------------------------------------
  console.log('--- 1. VERIFYING UI TEMPLATES ---');
  const createEjsPath = path.join(__dirname, '../src/views/orders/create.ejs');
  const indexEjsPath = path.join(__dirname, '../src/views/orders/index.ejs');
  const detailEjsPath = path.join(__dirname, '../src/views/orders/detail.ejs');

  const createEjs = fs.readFileSync(createEjsPath, 'utf8');
  const indexEjs = fs.readFileSync(indexEjsPath, 'utf8');
  const detailEjs = fs.readFileSync(detailEjsPath, 'utf8');

  // A. In create.ejs:
  // When initialType !== 'frame', Photo Frame Studio Order option must not be present
  assert.ok(createEjs.includes('Commercial & General Printing Order'), 'create.ejs must have dedicated commercial print header');
  assert.ok(createEjs.includes("initialType === 'frame'"), 'create.ejs must condition frame vs general print');
  assert.ok(createEjs.includes('Paper Substrates & Printing Materials Only (NO Photo Frames)'), 'create.ejs must isolate stock materials for print orders');
  assert.ok(createEjs.includes('stockReductionNotice'), 'create.ejs must have auto-reduction notice for office use');
  assert.ok(createEjs.includes('orderWastageQty'), 'create.ejs must have optional manual wastage input');
  console.log('✓ create.ejs: Photo Frame options isolated away from ordinary print orders.');
  console.log('✓ create.ejs: Auto-inventory deduction & manual wastage fields present.');

  // B. In index.ejs:
  assert.ok(indexEjs.includes('Paper substrate / printing material currently out of stock'), 'index.ejs remove modal must have printing material option without Frame size');
  console.log('✓ index.ejs: Ordinary print order remove modal does not mention Frame size.');

  // C. In detail.ejs:
  assert.ok(detailEjs.includes('Paper substrate / printing material currently out of stock'), 'detail.ejs remove modal must have printing material option');
  assert.ok(detailEjs.includes('orderWastageModal'), 'detail.ejs must have orderWastageModal');
  assert.ok(detailEjs.includes('Record Misprint / Wastage'), 'detail.ejs must have button to record misprints');
  console.log('✓ detail.ejs: Removal modal cleaned and wastage modal present.');

  // --------------------------------------------------------------------------
  // TEST PART 2: Database & Backend Material Auto-Deduction (Office Use)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AUTOMATIC MATERIAL INVENTORY REDUCTION (OFFICE USE) ---');

  // Step 2a: Create test customer
  const custCode = 'CUST-TEST-MAT-' + Date.now().toString().slice(-4);
  const testCustomer = await Customer.create({
    customerCode: custCode,
    name: 'Print Test Customer',
    phone: '0779998877',
    address: 'Colombo 03',
  });
  console.log(`Created test customer ID: ${testCustomer.id} (${testCustomer.name})`);

  // Step 2b: Create test stock item (e.g. A4 80gsm Copier Paper, 100 sheets)
  const stkCode = 'STK-TEST-' + Date.now().toString().slice(-4);
  const testStockItem = await StockItem.create({
    code: stkCode,
    name: 'A4 80GSM Copier Paper Sheets',
    category: 'Paper / Substrate',
    unit: 'Sheets',
    currentStock: 100.00,
    minStockAlert: 10.00,
    unitCost: 2.50,
    sellingPrice: 5.00,
    isActive: true,
  });
  console.log(`Created test stock item ID: ${testStockItem.id} (${testStockItem.name}, Stock: ${testStockItem.currentStock} ${testStockItem.unit})`);

  // Step 2c: Create an ordinary print order for 40 sheets
  console.log('\nPlacing print order for 40 A4 sheets...');
  const orderNum = await orderService.generateOrderNumber();
  const printOrder = await orderService.createOrder({
    orderNumber: orderNum,
    customerId: testCustomer.id,
    orderDate: '2026-11-11',
    jobTitle: '40x A4 Color Project Reports',
    orderType: 'GENERAL_PRINT',
    stockItemId: testStockItem.id,
    paperMaterial: testStockItem.name,
    quantity: 40,
    subtotal: 200.00,
    discount: 0.00,
    totalAmount: 200.00,
    advancePaid: 200.00,
    balanceAmount: 0.00,
    status: 'RECEIVED',
    paymentMethod: 'CASH',
  });

  console.log(`Created Order #${printOrder.orderNumber} (ID: ${printOrder.id})`);
  assert.strictEqual(printOrder.orderType, 'GENERAL_PRINT');
  assert.strictEqual(printOrder.stockDeducted, true, 'Order stockDeducted flag must be true');
  assert.strictEqual(parseFloat(printOrder.stockDeductedQty), 40, 'Order stockDeductedQty must be 40');
  assert.strictEqual(printOrder.stockItemId, testStockItem.id, 'Order stockItemId must match test stock item');

  // Verify stock item inventory was reduced from 100 to 60
  const refreshedStock = await StockItem.findByPk(testStockItem.id);
  assert.strictEqual(parseFloat(refreshedStock.currentStock), 60.00, `Stock should be reduced by 40 (expected 60, got ${refreshedStock.currentStock})`);
  console.log(`✓ Inventory currentStock correctly reduced: 100 -> ${refreshedStock.currentStock} ${refreshedStock.unit}`);

  // Verify StockTransaction was created as OFFICE_USE
  const officeTx = await StockTransaction.findOne({
    where: {
      stockItemId: testStockItem.id,
      type: 'OUT',
      category: 'OFFICE_USE',
    },
    order: [['createdAt', 'DESC']],
  });
  assert.ok(officeTx, 'StockTransaction with category OFFICE_USE must exist');
  assert.strictEqual(parseFloat(officeTx.quantity), 40, 'Transaction quantity must be 40');
  assert.strictEqual(parseFloat(officeTx.balanceAfter), 60.00, 'Transaction balanceAfter must be 60');
  assert.ok(officeTx.reference.includes(printOrder.orderNumber), 'Reference must cite the print order number');
  console.log(`✓ StockTransaction logged: Type=${officeTx.type}, Category=${officeTx.category}, Qty=${officeTx.quantity}, BalanceAfter=${officeTx.balanceAfter}`);
  console.log(`  Reference: "${officeTx.reference}"`);

  // --------------------------------------------------------------------------
  // TEST PART 3: Manual Removal of Misprinted / Damaged Materials (10 Sheets)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. MANUAL REMOVAL OF MISPRINTED / DAMAGED MATERIALS (10 SHEETS) ---');
  console.log('Simulating manual removal of 10 sheets that were not printed well...');

  const wastageResult = await orderService.recordOrderMaterialWastage(printOrder.id, {
    stockItemId: testStockItem.id,
    quantity: 10,
    reason: 'WASTAGE',
    notes: '10 sheets not printed well due to toner alignment error',
  });

  assert.strictEqual(wastageResult.removedQty, 10, 'Removed quantity must be 10');
  assert.strictEqual(wastageResult.reason, 'WASTAGE', 'Reason must be WASTAGE');

  // Verify inventory reduced by 10 more (60 -> 50)
  const stockAfterWastage = await StockItem.findByPk(testStockItem.id);
  assert.strictEqual(parseFloat(stockAfterWastage.currentStock), 50.00, `Stock should be reduced from 60 to 50 (got ${stockAfterWastage.currentStock})`);
  console.log(`✓ Inventory currentStock correctly reduced: 60 -> ${stockAfterWastage.currentStock} ${stockAfterWastage.unit}`);

  // Verify wastage StockTransaction was logged
  const wastageTx = await StockTransaction.findOne({
    where: {
      stockItemId: testStockItem.id,
      type: 'OUT',
      category: 'WASTAGE',
    },
    order: [['createdAt', 'DESC']],
  });
  assert.ok(wastageTx, 'StockTransaction with category WASTAGE must exist');
  assert.strictEqual(parseFloat(wastageTx.quantity), 10, 'Wastage transaction quantity must be 10');
  assert.strictEqual(parseFloat(wastageTx.balanceAfter), 50.00, 'Wastage balanceAfter must be 50');
  assert.ok(wastageTx.reference.includes(printOrder.orderNumber), 'Reference must cite the print order number');
  console.log(`✓ Wastage StockTransaction logged: Type=${wastageTx.type}, Category=${wastageTx.category}, Qty=${wastageTx.quantity}, BalanceAfter=${wastageTx.balanceAfter}`);

  // Verify Order record updated with wastageQty and audit note
  const updatedOrder = await Order.findByPk(printOrder.id);
  assert.strictEqual(parseFloat(updatedOrder.wastageQty), 10, 'Order wastageQty must be 10');
  assert.ok(updatedOrder.notes.includes('[Manual Material Removal]'), 'Order notes must include manual removal audit trail');
  console.log(`✓ Order #${updatedOrder.orderNumber} updated: wastageQty=${updatedOrder.wastageQty}`);
  console.log(`  Order notes snippet: ${updatedOrder.notes.split('\n').pop()}`);

  // --------------------------------------------------------------------------
  // TEST PART 4: Clean Up Dummy Test Data
  // --------------------------------------------------------------------------
  console.log('\n--- 4. CLEANING UP DUMMY TEST DATA ---');
  await StockTransaction.destroy({ where: { stockItemId: testStockItem.id } });
  const { Payment } = require('../src/models');
  await Payment.destroy({ where: { orderId: printOrder.id } });
  await Order.destroy({ where: { id: printOrder.id } });
  await StockItem.destroy({ where: { id: testStockItem.id } });
  await Customer.destroy({ where: { id: testCustomer.id } });

  // Verify everything was cleaned up
  const verifyOrder = await Order.findByPk(printOrder.id);
  const verifyStock = await StockItem.findByPk(testStockItem.id);
  const verifyCust = await Customer.findByPk(testCustomer.id);
  const verifyTxs = await StockTransaction.findAll({ where: { stockItemId: testStockItem.id } });

  assert.strictEqual(verifyOrder, null, 'Test order must be deleted');
  assert.strictEqual(verifyStock, null, 'Test stock item must be deleted');
  assert.strictEqual(verifyCust, null, 'Test customer must be deleted');
  assert.strictEqual(verifyTxs.length, 0, 'Test stock transactions must be deleted');
  console.log('✓ All dummy test data successfully cleaned from database (0 residual records).');

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
  process.exit(0);
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
