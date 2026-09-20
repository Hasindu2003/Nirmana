const assert = require('assert');
const { Op } = require('sequelize');
const {
  sequelize,
  Customer,
  Order,
  StockItem,
  StockTransaction,
} = require('../src/models');
const stockService = require('../src/services/stockService');
const orderService = require('../src/services/orderService');
const customerService = require('../src/services/customerService');
const dashboardService = require('../src/services/dashboardService');

async function runStreamlinedTests() {
  console.log('\n======================================================');
  console.log('🧪 Testing Simplified Nirmana Stock & Order Management');
  console.log('======================================================\n');

  try {
    // Pre-clean any test fixtures from previous failed runs
    await StockTransaction.destroy({ where: {} });
    await StockItem.destroy({ where: { code: ['TEST-STK-01', 'TEST-STK-02'] } });
    await StockItem.destroy({ where: { name: 'Test Heavy Cardstock 350gsm' } });
    await Order.destroy({ where: { orderNumber: ['ORD-2026-0001', 'ORD-2026-0002'] } });
    await Customer.destroy({ where: { customerCode: { [Op.like]: 'CUST-PAGE-%' } } });
    await Customer.destroy({ where: { customerCode: 'CUST-TEST-01' } });
    await Customer.destroy({ where: { name: 'Kamal Auto Test' } });

    // 0. Setup Test Stock Item
    console.log('Setup: Creating isolated test stock item...');
    const testItem = await StockItem.create({
      code: 'TEST-STK-01',
      name: 'Test Sapphire 300gsm Art Board',
      category: 'Paper / Substrate',
      unit: 'Sheets',
      currentStock: 500,
      minStockAlert: 100,
      unitCost: 25.00,
      notes: 'Automated test item',
    });

    const lowItem = await StockItem.create({
      code: 'TEST-STK-02',
      name: 'Test Low Stock Eco Ink',
      category: 'Ink / Toner',
      unit: 'Bottles',
      currentStock: 2,
      minStockAlert: 10,
      unitCost: 5000.00,
    });

    // 1. Test Stock In (Arrival)
    console.log('Test 1: Stock In (Stock Arrival)...');
    const inResult = await stockService.recordStockIn({
      stockItemId: testItem.id,
      quantity: 100,
      reference: 'PO-TEST-01',
      notes: 'Test stock shipment arrival',
    });

    assert.strictEqual(parseFloat(inResult.item.currentStock), 600, 'Stock level should increase from 500 to 600');
    assert.strictEqual(inResult.transaction.type, 'IN', 'Transaction type should be IN');
    assert.strictEqual(parseFloat(inResult.transaction.balanceAfter), 600, 'Transaction balanceAfter should be 600');
    console.log(`  ✓ Stock In verified: 500 -> ${inResult.item.currentStock} ${testItem.unit}.`);

    // 2. Test Stock Out (Usage)
    console.log('Test 2: Stock Out (Stock Deduction / Usage)...');
    const outResult = await stockService.recordStockOut({
      stockItemId: testItem.id,
      quantity: 50,
      reference: 'Job #TEST-USAGE',
      notes: 'Test deduction for print production',
    });

    assert.strictEqual(parseFloat(outResult.item.currentStock), 550, 'Stock level should decrease from 600 to 550');
    assert.strictEqual(outResult.transaction.type, 'OUT', 'Transaction type should be OUT');
    console.log(`  ✓ Stock Out verified: 600 -> ${outResult.item.currentStock} ${testItem.unit}.`);

    // 3. Test Stock Out validation (Cannot exceed available stock)
    console.log('Test 3: Stock Out Over-deduction Prevention...');
    let threwError = false;
    try {
      await stockService.recordStockOut({
        stockItemId: testItem.id,
        quantity: 999999, // Way more than available
        reference: 'Invalid Over-deduction',
      });
    } catch (err) {
      threwError = true;
      assert(err.message.includes('Only 550 Sheets available'), 'Error should specify available stock amount');
    }
    assert(threwError, 'Should throw error when deducting more than current stock');
    console.log('  ✓ Over-deduction correctly prevented with validation error.');

    // 4. Test Order Creation with Existing Customer
    console.log('Test 4: Order Creation with Existing Customer...');
    const existingCust = await Customer.create({
      customerCode: 'CUST-TEST-01',
      name: 'Kasun Test Perera',
      phone: '0770001111',
      companyName: 'Test Media Ltd',
    });

    const order1 = await orderService.createOrder({
      customerId: existingCust.id,
      jobTitle: '1,000 Test Business Cards',
      paperMaterial: 'Test Sapphire 300gsm',
      quantity: 1000,
      totalAmount: 5000,
      advancePaid: 1500,
      status: 'RECEIVED',
    });

    assert(order1.id, 'Order should be created');
    assert.strictEqual(parseFloat(order1.balanceAmount), 3500, 'Balance should be total - advance (5000 - 1500 = 3500)');
    assert.strictEqual(order1.customerId, existingCust.id, 'Order customerId must match existing customer');
    console.log(`  ✓ Order ${order1.orderNumber} created for existing customer (${existingCust.name}). Balance: Rs. ${order1.balanceAmount}`);

    // 5. Test Order Creation with Automatic Customer Account Creation
    console.log('Test 5: Order Creation with Automatic Customer Account Creation...');
    const order2 = await orderService.createOrder({
      newCustomerName: 'Kamal Auto Test',
      newCustomerPhone: '0718889999',
      newCustomerCompany: 'Auto Created Co',
      jobTitle: '50x Ceramic Sublimation Mugs',
      quantity: 50,
      totalAmount: 9000,
      advancePaid: 5000,
      status: 'RECEIVED',
    });

    assert(order2.id, 'Order should be created');
    assert(order2.customerId, 'Order should have an associated customerId');

    const createdCust = await Customer.findByPk(order2.customerId);
    assert(createdCust, 'Customer record should be created in database');
    assert.strictEqual(createdCust.name, 'Kamal Auto Test', 'Customer name should match');
    assert.strictEqual(createdCust.phone, '0718889999', 'Customer phone should match');
    assert(createdCust.customerCode.startsWith('CUST-'), 'Customer code should be generated (CUST-XXXX)');
    console.log(`  ✓ Automatic Customer Creation verified! Created customer '${createdCust.name}' (${createdCust.customerCode}) and linked Order ${order2.orderNumber}.`);

    // 6. Test Order Status Progression & Payment Settlement
    console.log('Test 6: Order Status Progression & Payment Recording...');
    await orderService.updateOrderStatus(order2.id, 'PRINTING');
    let reloaded = await Order.findByPk(order2.id);
    assert.strictEqual(reloaded.status, 'PRINTING', 'Status should update to PRINTING');

    await orderService.updateOrderStatus(order2.id, 'READY');
    reloaded = await Order.findByPk(order2.id);
    assert.strictEqual(reloaded.status, 'READY', 'Status should update to READY');

    // Record payment
    const paidOrder = await orderService.recordPayment(order2.id, 4000);
    assert.strictEqual(parseFloat(paidOrder.balanceAmount), 0, 'Balance should now be zero');
    assert.strictEqual(parseFloat(paidOrder.advancePaid), 9000, 'Total paid should now be 9000');
    console.log('  ✓ Status progressed (RECEIVED -> PRINTING -> READY) and final balance payment settled.');

    // 7. Test Dashboard Aggregations
    console.log('Test 7: Dashboard Stats...');
    const stats = await dashboardService.getDashboardStats();
    assert(stats.kpis.activeOrdersCount >= 1, 'Should count active orders');
    assert(stats.lowStockItems.length >= 1, 'Should detect low stock items');
    assert(stats.recentTransactions.length >= 1, 'Should include recent stock transactions');
    console.log(`  ✓ Dashboard verified: ${stats.kpis.activeOrdersCount} active orders, ${stats.lowStockItems.length} low stock items flagged.`);

    // 8. Test Pagination
    console.log('Test 8: Table Pagination Calculations & Navigation...');
    // Seed a batch of 12 temporary customers to test pagination windowing
    const tempCustomerIds = [];
    for (let i = 1; i <= 12; i++) {
      const c = await Customer.create({
        customerCode: `CUST-PAGE-${i.toString().padStart(3, '0')}`,
        name: `Pagination Test User ${i}`,
        phone: `077${i.toString().padStart(7, '0')}`,
      });
      tempCustomerIds.push(c.id);
    }

    // Request Page 1 (limit: 5)
    const page1 = await customerService.getAllCustomers({ page: 1, limit: 5, paginate: true });
    assert.strictEqual(page1.customers.length, 5, 'Page 1 should contain exactly 5 customers');
    assert(page1.pagination.totalItems >= 14, 'Total items should reflect all test customers');
    assert.strictEqual(page1.pagination.currentPage, 1, 'Current page should be 1');
    assert.strictEqual(page1.pagination.hasNextPage, true, 'Page 1 should have next page');
    assert.strictEqual(page1.pagination.hasPrevPage, false, 'Page 1 should not have prev page');
    assert.strictEqual(page1.pagination.startItem, 1, 'Start item should be 1');
    assert.strictEqual(page1.pagination.endItem, 5, 'End item should be 5');

    // Request Page 2 (limit: 5)
    const page2 = await customerService.getAllCustomers({ page: 2, limit: 5, paginate: true });
    assert.strictEqual(page2.customers.length, 5, 'Page 2 should contain 5 customers');
    assert.strictEqual(page2.pagination.currentPage, 2, 'Current page should be 2');
    assert.strictEqual(page2.pagination.hasPrevPage, true, 'Page 2 should have prev page');
    assert.strictEqual(page2.pagination.startItem, 6, 'Start item should be 6');
    assert.strictEqual(page2.pagination.endItem, 10, 'End item should be 10');

    // Test Orders pagination
    const ordersPaged = await orderService.getAllOrders({ page: 1, limit: 1, paginate: true });
    assert.strictEqual(ordersPaged.orders.length, 1, 'Orders page should respect limit');
    assert.strictEqual(ordersPaged.pagination.limit, 1, 'Limit should match query');

    // Test Stock Movements pagination
    const txPaged = await stockService.getRecentTransactions({ page: 1, limit: 1, paginate: true });
    assert.strictEqual(txPaged.transactions.length, 1, 'Stock transactions should respect limit');
    console.log(`  ✓ Pagination verified across Page 1 & Page 2 with accurate metadata (total: ${page1.pagination.totalItems}, pages: ${page1.pagination.totalPages}).`);

    // 9. Test Stock Pricing, Batch Cost Calculation, and Estimated Profit Metrics
    console.log('Test 9: Stock Item Pricing, Batch Cost, and Profit Metrics...');
    const pricedItem = await stockService.createStockItem({
      name: 'Test Heavy Cardstock 350gsm',
      category: 'Paper / Substrate',
      unit: 'Sheets',
      initialStock: 200,
      batchCost: 5000.00, // 5000 / 200 = 25.00 unit cost
      sellingPrice: 40.00,
      minStockAlert: 50,
    });

    assert.strictEqual(parseFloat(pricedItem.unitCost), 25.00, 'Unit cost should be auto-derived from batch cost / initial stock');
    assert.strictEqual(parseFloat(pricedItem.sellingPrice), 40.00, 'Selling price should match');
    
    const profitMetrics = pricedItem.getProfitInfo();
    assert(profitMetrics !== null, 'Profit info should not be null');
    assert.strictEqual(profitMetrics.unitProfit, 15.00, 'Unit profit should be 40 - 25 = 15');
    assert.strictEqual(profitMetrics.marginPercent, 37.5, 'Margin percent should be (15 / 40) * 100 = 37.5%');
    assert.strictEqual(profitMetrics.isProfit, true, 'isProfit should be true');

    // Test Stock In arrival with custom pricing
    const stockInPriced = await stockService.recordStockIn({
      stockItemId: pricedItem.id,
      quantity: 100,
      unitCost: 20.00,
      sellingPrice: 35.00,
      reference: 'PO-NEW-BATCH-01',
    });

    assert.strictEqual(parseFloat(stockInPriced.item.unitCost), 20.00, 'Stock item unit cost should update on arrival');
    assert.strictEqual(parseFloat(stockInPriced.item.sellingPrice), 35.00, 'Stock item selling price should update on arrival');
    assert.strictEqual(parseFloat(stockInPriced.transaction.totalCost), 2000.00, 'Transaction total cost should be 20 * 100 = 2000');
    assert.strictEqual(stockInPriced.profitInfo.unitProfit, 15.00, 'Profit info unit profit should be 35 - 20 = 15');
    assert.strictEqual(stockInPriced.profitInfo.batchProfit, 1500.00, 'Profit info batch profit should be 15 * 100 = 1500');
    console.log(`  ✓ Pricing & profit verified: Unit Buy Rs. 20, Sell Rs. 35 -> Profit: +Rs. 15/unit (+Rs. 1500 batch, 42.9% margin).`);

    // 10. Test Strict 10-Digit Phone Number (Must Start with 0) Validation
    console.log('Test 10: Strict 10-Digit Phone Number Validation (starts with 0)...');
    // 10a: Reject less than 10 digits
    await assert.rejects(
      () => customerService.createCustomer({ name: 'Short Phone', phone: '077123456' }),
      /Phone number must be exactly 10 digits starting with 0/,
      'Should reject 9-digit phone'
    );
    // 10b: Reject more than 10 digits
    await assert.rejects(
      () => customerService.createCustomer({ name: 'Long Phone', phone: '07712345678' }),
      /Phone number must be exactly 10 digits starting with 0/,
      'Should reject 11-digit phone'
    );
    // 10c: Reject not starting with 0
    await assert.rejects(
      () => customerService.createCustomer({ name: 'No Zero Phone', phone: '7712345678' }),
      /Phone number must be exactly 10 digits starting with 0/,
      'Should reject phone not starting with 0'
    );
    // 10d: Reject non-digit characters
    await assert.rejects(
      () => customerService.createCustomer({ name: 'Invalid Char Phone', phone: '+947712345' }),
      /Phone number must be exactly 10 digits starting with 0/,
      'Should reject international + format'
    );
    // 10e: Reject in orderService inline customer creation
    await assert.rejects(
      () => orderService.createOrder({
        newCustomerName: 'Inline Invalid Phone',
        newCustomerPhone: '077123',
        jobTitle: 'Phone Test Order',
        quantity: 1,
      }),
      /Phone number must be exactly 10 digits starting with 0/,
      'Order intake should reject invalid customer phone'
    );
    // 10f: Accept exactly 10 digits starting with 0
    const validCust = await customerService.createCustomer({
      name: 'Valid Phone Customer',
      phone: '0779998888',
    });
    assert.strictEqual(validCust.phone, '0779998888', 'Should accept valid 10-digit phone starting with 0');
    await Customer.destroy({ where: { id: validCust.id } });
    console.log('  ✓ Phone validation verified: strictly 10 digits starting with 0 enforced across models & services.');

    // Teardown: Clean up test fixtures so database remains 100% clean
    console.log('\nTeardown: Cleaning up test fixtures...');
    await Order.destroy({ where: { id: [order1.id, order2.id] } });
    await Customer.destroy({ where: { id: [existingCust.id, createdCust.id, ...tempCustomerIds] } });
    await StockTransaction.destroy({ where: { stockItemId: [testItem.id, lowItem.id, pricedItem.id] } });
    await StockItem.destroy({ where: { id: [testItem.id, lowItem.id, pricedItem.id] } });
    console.log('  ✓ All test fixtures cleanly removed.');

    console.log('\n======================================================');
    console.log('🎉 ALL STREAMLINED STOCK & ORDER TESTS PASSED (10/10)!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runStreamlinedTests();
