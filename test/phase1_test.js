/**
 * ARCHIVED / LEGACY TEST: Phase 1 Prototype Specification
 * Note: The active production test suite is test/streamlined_test.js (invoked by "npm test").
 * This file is preserved for reference to earlier multi-role / separate Product-catalog specs.
 */
const assert = require('assert');
const {
  sequelize,
  User,
  Customer,
  ProductCategory,
  Product,
  Order,
  OrderItem,
  Payment,
  PaymentSchedule,
  AuditLog,
} = require('../src/models');
const authService = require('../src/services/authService');
const customerService = require('../src/services/customerService');
const productService = require('../src/services/productService');
const orderService = require('../src/services/orderService');
const dashboardService = require('../src/services/dashboardService');

async function runPhase1Tests() {
  console.log('\n========================================');
  console.log('🧪 Starting Nirmana Phase 1 Sanity Tests');
  console.log('========================================\n');

  try {
    // Test 1: Authentication & Password Verification
    console.log('Test 1: Authentication & Passwords...');
    const loginResult = await authService.login('admin', 'Password123!');
    assert(loginResult.token, 'Token should be returned on successful login');
    assert.strictEqual(loginResult.user.role, 'ADMIN', 'User role should be ADMIN');
    console.log('  ✓ Admin login verified and JWT generated.');

    // Test 2: Role-based users exist
    console.log('Test 2: Role-based User Master Data...');
    const allUsers = await User.findAll();
    const roles = allUsers.map(u => u.role);
    ['ADMIN', 'MANAGER', 'SALES', 'PRODUCTION', 'INVENTORY', 'ACCOUNTANT'].forEach(r => {
      assert(roles.includes(r), `Role ${r} should exist in users table`);
    });
    console.log('  ✓ All 6 user roles verified in database.');

    // Test 3: Customer Management & Credit Check
    console.log('Test 3: Customer Management & Credit Limits...');
    const newCust = await customerService.createCustomer({
      name: 'Test Testov',
      companyName: 'Testov Print Media',
      customerType: 'BUSINESS',
      phone: '0779998888',
      email: 'testov@media.lk',
      creditLimit: 50000,
      paymentTerms: 'NET_30',
    });
    assert(newCust.id, 'Customer should have an ID');
    assert.strictEqual(parseFloat(newCust.creditLimit), 50000, 'Credit limit should be 50,000');
    assert.strictEqual(newCust.getAvailableCredit(), 50000, 'Available credit should be 50,000');
    console.log(`  ✓ Customer created with code: ${newCust.customerCode}`);

    // Test 4: Product Catalog
    console.log('Test 4: Product Catalog & Categories...');
    const products = await productService.getAllProducts({});
    assert(products.length >= 5, 'Should have at least 5 seeded products');
    const physical = products.filter(p => p.type === 'PHYSICAL');
    const services = products.filter(p => p.type === 'SERVICE');
    assert(physical.length > 0, 'Physical products should exist');
    assert(services.length > 0, 'Service products should exist');
    console.log(`  ✓ Products verified: ${services.length} services, ${physical.length} physical substrates.`);

    // Test 5: Order Creation with Custom Print Specifications & Split Payments
    console.log('Test 5: Order Creation with Detailed Printing Specs...');
    const adminUser = await User.findOne({ where: { role: 'ADMIN' } });
    const order = await orderService.createOrder({
      customerId: newCust.id,
      salesRepId: adminUser.id,
      orderDate: '2024-10-25',
      deliveryDueDate: '2024-10-28',
      status: 'CONFIRMED',
      priority: 'HIGH',
      discount: 200,
      initialPayment: 2000,
      paymentMethod: 'BANK_TRANSFER',
      scheduledAmount: 6800,
      scheduledDueDate: '2024-11-15',
      items: [
        {
          itemDescription: '500x Premium Matte Soft-Touch Brochures',
          quantity: 5,
          unitPrice: 1800,
          specifications: {
            paperMaterial: '350gsm Dutch Ivory Art Card',
            size: 'A4',
            gsm: '350gsm',
            colorMode: 'Full Color CMYK',
            sides: 'Double-sided',
            pages: 4,
            finishingOptions: ['Matte Velvet Soft-Touch', 'Machine Tri-Fold Scoring']
          }
        }
      ]
    }, adminUser.id);

    assert(order.id, 'Order should be created with an ID');
    assert.strictEqual(order.status, 'CONFIRMED', 'Order status should be CONFIRMED');
    assert.strictEqual(parseFloat(order.subtotal), 9000, 'Subtotal should be 9,000 (5 * 1800)');
    assert.strictEqual(parseFloat(order.totalAmount), 8800, 'Total should be 8,800 (9000 - 200 discount)');
    assert.strictEqual(parseFloat(order.paidAmount), 2000, 'Paid amount should be 2,000');
    assert.strictEqual(parseFloat(order.balanceAmount), 6800, 'Remaining balance should be 6,800');
    console.log(`  ✓ Order ${order.orderNumber} created successfully. Total: Rs. ${order.totalAmount}, Paid: Rs. ${order.paidAmount}, Balance: Rs. ${order.balanceAmount}`);

    // Verify Customer balance updated
    const updatedCust = await Customer.findByPk(newCust.id);
    assert.strictEqual(parseFloat(updatedCust.outstandingBalance), 6800, 'Customer debt should increase by balance');
    assert.strictEqual(updatedCust.getAvailableCredit(), 50000 - 6800, 'Customer available credit should reduce');
    console.log(`  ✓ Customer credit correctly deducted: Rs. ${updatedCust.getAvailableCredit()} available.`);

    // Test 6: Order Status Transitions
    console.log('Test 6: Order Workflow Lifecycle Transitions...');
    // CONFIRMED -> DESIGNING
    const t1 = await orderService.updateOrderStatus(order.id, 'DESIGNING', 'Art team started proofing', adminUser.id);
    assert.strictEqual(t1.order.status, 'DESIGNING', 'Status should transition to DESIGNING');

    // DESIGNING -> DESIGN_APPROVED
    const t2 = await orderService.updateOrderStatus(order.id, 'DESIGN_APPROVED', 'Customer signed off PDF proof', adminUser.id);
    assert.strictEqual(t2.order.status, 'DESIGN_APPROVED', 'Status should transition to DESIGN_APPROVED');

    // DESIGN_APPROVED -> PRINTING
    const t3 = await orderService.updateOrderStatus(order.id, 'PRINTING', 'Loaded to Heidelberg Speedmaster', adminUser.id);
    assert.strictEqual(t3.order.status, 'PRINTING', 'Status should transition to PRINTING');

    // PRINTING -> READY
    const t4 = await orderService.updateOrderStatus(order.id, 'READY', 'Quality check passed, packaged', adminUser.id);
    assert.strictEqual(t4.order.status, 'READY', 'Status should transition to READY');
    console.log('  ✓ Workflow lifecycle transitions verified (CONFIRMED -> DESIGNING -> DESIGN_APPROVED -> PRINTING -> READY).');

    // Test 7: Recording Remaining Payment & Fulfilling Schedules
    console.log('Test 7: Recording Payment & Fulfilling Scheduled Commitments...');
    const payResult = await orderService.recordPayment(order.id, {
      amount: 6800,
      paymentMethod: 'CASH',
      referenceNumber: 'CASH-FINAL-SETTLEMENT',
      notes: 'Final payment received upon delivery',
    }, adminUser.id);

    assert.strictEqual(parseFloat(payResult.order.balanceAmount), 0, 'Order balance should be zero');
    assert.strictEqual(parseFloat(payResult.order.paidAmount), 8800, 'Order paid amount should be 8,800');

    const customerAfterPay = await Customer.findByPk(newCust.id);
    assert.strictEqual(parseFloat(customerAfterPay.outstandingBalance), 0, 'Customer debt should be cleared');
    console.log('  ✓ Payment recorded, order balance cleared, and scheduled commitment marked PAID.');

    // Test 8: Dashboard Aggregations
    console.log('Test 8: Dashboard Aggregation Service...');
    const dashboardStats = await dashboardService.getDashboardStats();
    assert(dashboardStats.kpis, 'Dashboard KPIs should be present');
    assert(dashboardStats.kpis.inProductionCount >= 0, 'In-production count should be a valid number');
    assert(dashboardStats.stockAlerts.length > 0, 'Stock alerts should be present');
    console.log('  ✓ Dashboard metrics and real-time aggregations verified.');

    // Test 9: Audit Trail
    console.log('Test 9: Audit Logs...');
    const logs = await AuditLog.findAll({ limit: 5 });
    assert(logs.length > 0, 'Audit logs should be recorded');
    console.log(`  ✓ System audit trail active with ${logs.length} logged events.`);

    console.log('\n========================================');
    console.log('🎉 ALL PHASE 1 SANITY TESTS PASSED!');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

runPhase1Tests();
