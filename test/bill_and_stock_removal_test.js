const assert = require('assert');
const { StockItem, StockTransaction, Order, Customer, PosSale, PosSaleItem } = require('../src/models');
const stockService = require('../src/services/stockService');
const orderService = require('../src/services/orderService');
const posService = require('../src/services/posService');

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING BILL / INVOICE & STOCK REMOVAL FUNCTIONALITY');
  console.log('===============================================================');

  // TEST 1: Stock Item Creation and Stock Removal
  console.log('\n1. Testing Stock Removal (Damaged / Wastage / Expired)...');
  const testItem = await StockItem.create({
    code: 'TEST-SUBSTRATE-' + Date.now().toString().slice(-4),
    name: 'Test Foam Board 5mm (White)',
    category: 'Paper / Substrate',
    unit: 'Sheets',
    currentStock: 50,
    minStockAlert: 10,
    unitCost: 120.00,
    sellingPrice: 250.00,
    isActive: true,
  });

  console.log(`   ✓ Created test stock item: ${testItem.name} with 50 Sheets @ Rs. 120.00`);

  // Remove 5 sheets due to damage
  const removalResult = await stockService.recordStockRemoval({
    stockItemId: testItem.id,
    quantity: 5,
    reason: 'DAMAGED',
    reference: 'DMG-INCIDENT-001',
    notes: '5 sheets dented by forklift corner',
    date: '2026-11-06',
  });

  assert.strictEqual(parseFloat(removalResult.item.currentStock), 45, 'Stock should decrease from 50 to 45');
  assert.strictEqual(removalResult.removedQty, 5, 'Removed quantity should be 5');
  assert.strictEqual(removalResult.lossValue, 600.00, 'Loss value should be 5 * 120 = 600.00');
  assert.strictEqual(removalResult.transaction.category, 'DAMAGED');
  console.log(`   ✓ Successfully removed 5 Sheets (DAMAGED). Remaining: ${removalResult.item.currentStock}, Loss: Rs. ${removalResult.lossValue}`);

  // TEST 2: Querying Removed Stock Ledger
  console.log('\n2. Testing getRemovedStockTransactions ledger query...');
  const ledgerResult = await stockService.getRemovedStockTransactions({ paginate: false });
  assert.ok(ledgerResult.transactions.length > 0, 'Should find at least 1 removed transaction');
  const found = ledgerResult.transactions.find(t => t.id === removalResult.transaction.id);
  assert.ok(found, 'Should contain newly created removal transaction');
  console.log(`   ✓ Ledger contains ${ledgerResult.transactions.length} removal transactions. Summary total loss: Rs. ${ledgerResult.summary.totalLossValue}`);

  // TEST 3: Soft-delete Stock Item
  console.log('\n3. Testing deleteStockItem (archiving item with history)...');
  const deleteResult = await stockService.deleteStockItem(testItem.id);
  assert.strictEqual(deleteResult.softDeleted, true, 'Item with transactions should be soft-deleted (isActive: false)');
  const refetched = await StockItem.findByPk(testItem.id);
  assert.strictEqual(refetched.isActive, false, 'Item should be marked inactive');
  console.log(`   ✓ Successfully archived stock item: ${deleteResult.message}`);

  // TEST 4: Bill / Invoice data structure for Orders
  console.log('\n4. Testing Bill / Invoice Data Preparation for Orders...');
  let customer = await Customer.findOne();
  if (!customer) {
    customer = await Customer.create({
      name: 'Kamal Perera',
      phone: '0771234567',
      email: 'kamal@example.com',
      address: 'Kandy Road, Colombo',
    });
  }

  const testOrder = await Order.create({
    orderNumber: 'ORD-TEST-' + Date.now().toString().slice(-4),
    customerId: customer.id,
    orderDate: '2026-11-06',
    jobTitle: 'Deluxe Matte Business Cards 500pcs',
    paperMaterial: '350gsm Silk Card',
    specifications: 'Double sided full color print, matte lamination, round corners',
    quantity: 500,
    subtotal: 3500.00,
    totalAmount: 3500.00,
    advancePaid: 1500.00,
    balanceAmount: 2000.00,
    status: 'RECEIVED',
  });

  const orderDetails = await orderService.getOrderById(testOrder.id);
  assert.strictEqual(orderDetails.orderNumber, testOrder.orderNumber);
  console.log(`   ✓ Order ${orderDetails.orderNumber} loaded with customer: ${orderDetails.customer.name}`);

  // TEST 5: Verify POS Sale and Invoice Data
  console.log('\n5. Testing POS Sale Creation & Receipt Query...');
  const saleResult = await posService.createSale({
    customerName: 'Sunil Silva',
    paymentMethod: 'CASH',
    amountTendered: 1000.00,
    items: [
      {
        itemName: 'Color A4 Print - Glossy',
        quantity: 10,
        unitPrice: 50.00,
        totalPrice: 500.00,
        unitCost: 15.00,
      },
      {
        itemName: 'Document Spiral Binding',
        quantity: 1,
        unitPrice: 250.00,
        totalPrice: 250.00,
        unitCost: 50.00,
      }
    ]
  });

  assert.ok(saleResult && saleResult.receiptNumber);
  const fetchedSale = await posService.getSaleById(saleResult.id);
  assert.strictEqual(fetchedSale.items.length, 2);
  assert.strictEqual(parseFloat(fetchedSale.totalAmount), 750.00);
  console.log(`   ✓ POS Sale ${fetchedSale.receiptNumber} recorded for ${fetchedSale.customerName} (Total: Rs. ${fetchedSale.totalAmount})`);

  console.log('\n===============================================================');
  console.log('🎉 ALL BILL / INVOICE & STOCK REMOVAL TESTS PASSED (5/5)!');
  console.log('===============================================================');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
