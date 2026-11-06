const assert = require('assert');
const { Order, Customer, Payment, QuickPrintJob, sequelize } = require('../src/models');
const orderService = require('../src/services/orderService');
const dashboardService = require('../src/services/dashboardService');

async function runPhotoOrderRemoveTest() {
  console.log('--- STARTING PHOTO ORDER REMOVE BUTTON TEST ---');

  // Step 1: Ensure test customer exists
  let customer = await Customer.findOne({ where: { phone: '0771234567' } });
  if (!customer) {
    customer = await Customer.create({
      customerCode: 'CUST-TEST-REMOVE',
      name: 'Chamara Perera',
      phone: '0771234567',
      address: 'Colombo 07',
    });
  }

  // Step 2: Create a photo frame order
  console.log('1. Creating Photo Frame Order...');
  const orderNum1 = await orderService.generateOrderNumber();
  const photoOrder1 = await Order.create({
    orderNumber: orderNum1,
    customerId: customer.id,
    orderDate: '2026-11-06',
    jobTitle: 'Teak Wooden Photo Frame 16x20 with Non-reflective Glass',
    orderType: 'PHOTO_FRAME',
    paperMaterial: 'Wooden Frame 16x20',
    specifications: 'Portrait photo of family, matte photo paper with mount',
    quantity: 1,
    subtotal: 6500.00,
    discount: 0.00,
    totalAmount: 6500.00,
    advancePaid: 2000.00,
    balanceAmount: 4500.00,
    status: 'RECEIVED',
    paymentStatus: 'PARTIAL',
  });
  console.log(`Created Photo Order #1: ID ${photoOrder1.id}, Number ${photoOrder1.orderNumber}, Status: ${photoOrder1.status}`);

  // Also create a second photo frame order to test bulk clean
  const orderNum2 = await orderService.generateOrderNumber();
  const photoOrder2 = await Order.create({
    orderNumber: orderNum2,
    customerId: customer.id,
    orderDate: '2026-11-06',
    jobTitle: 'Black Acrylic Photo Frame 12x18 for Wedding Picture',
    orderType: 'PHOTO_FRAME',
    paperMaterial: 'Acrylic Frame 12x18',
    specifications: 'High gloss print with black border',
    quantity: 2,
    subtotal: 9000.00,
    discount: 500.00,
    totalAmount: 8500.00,
    advancePaid: 8500.00,
    balanceAmount: 0.00,
    status: 'PRINTING',
    paymentStatus: 'PAID',
  });
  console.log(`Created Photo Order #2: ID ${photoOrder2.id}, Number ${photoOrder2.orderNumber}, Status: ${photoOrder2.status}`);

  // Step 3: Verify they appear in Photo Frame Studio list
  console.log('2. Checking Photo Frame Studio query...');
  const frameListResult = await orderService.getAllOrders({
    type: 'frame',
    status: 'ALL',
    paginate: false,
  });
  const frameOrders = Array.isArray(frameListResult) ? frameListResult : frameListResult.orders;
  const foundOrder1 = frameOrders.find(o => o.id === photoOrder1.id);
  const foundOrder2 = frameOrders.find(o => o.id === photoOrder2.id);
  assert(foundOrder1, 'Photo Order #1 must appear in Photo Frame Studio list');
  assert(foundOrder2, 'Photo Order #2 must appear in Photo Frame Studio list');
  assert.strictEqual(foundOrder1.orderType, 'PHOTO_FRAME');
  console.log('Pass: Photo Frame Orders correctly appear in Photo Frame Studio list.');

  // Step 4: Simulate clicking "Remove" on Photo Order #1
  console.log('3. Simulating "Remove from Queue" button click on Photo Order #1...');
  const cancelResult = await orderService.updateOrderStatus(
    photoOrder1.id,
    'CANCELLED',
    '[CANCELLED from Orders Queue]: Customer requested cancellation / changed mind'
  );
  assert.strictEqual(cancelResult.order.status, 'CANCELLED');
  console.log(`Pass: Photo Order #1 removed from active queue and marked CANCELLED. Notes: ${cancelResult.order.notes}`);

  // Verify dashboard stats reflect active vs cancelled
  const statsAfterCancel = await dashboardService.getDashboardStats('2026-11-06');
  console.log(`Frame Stats after cancellation: Active=${statsAfterCancel.frameStats.active}, Cancelled=${statsAfterCancel.frameStats.cancelled}`);
  assert(statsAfterCancel.frameStats.cancelled >= 1, 'Frame stats should report at least 1 cancelled order');

  // Step 5: Simulate clicking "Delete" on the Cancelled Photo Order #1 (permanent delete)
  console.log('4. Simulating permanent "Delete" button click on cancelled Photo Order #1...');
  const deleteResult1 = await orderService.deleteOrder(photoOrder1.id);
  assert(deleteResult1.success, 'Permanent delete must return success');
  const verifyDeleted = await Order.findByPk(photoOrder1.id);
  assert.strictEqual(verifyDeleted, null, 'Photo Order #1 must no longer exist in database');
  console.log(`Pass: Photo Order #1 permanently deleted successfully. Message: ${deleteResult1.message}`);

  // Step 6: Simulate cancelling Photo Order #2 and running "Clean Cancelled Frames"
  console.log('5. Cancelling Photo Order #2 and running Clean Cancelled Frames (bulk purge)...');
  await orderService.updateOrderStatus(
    photoOrder2.id,
    'CANCELLED',
    '[CANCELLED]: Frame size currently out of stock'
  );

  const cleanResult = await orderService.cleanCancelledOrders('PHOTO_FRAME');
  console.log(`Clean Cancelled Result: deletedCount=${cleanResult.deletedCount}, message=${cleanResult.message}`);
  assert(cleanResult.deletedCount >= 1, 'Clean cancelled should remove at least 1 cancelled photo frame order');
  const verifyCleaned = await Order.findByPk(photoOrder2.id);
  assert.strictEqual(verifyCleaned, null, 'Photo Order #2 must be cleaned up');
  console.log('Pass: Clean Cancelled Frames bulk purge verified successfully.');

  console.log('--- ALL PHOTO ORDER REMOVE & DELETE TESTS PASSED (100%) ---');
  process.exit(0);
}

runPhotoOrderRemoveTest().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
