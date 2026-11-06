const { User, Order, QuickPrintJob, QuickPrintFile, Customer } = require('../src/models');
const { Op } = require('sequelize');

async function runCancellationTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING CANCELLATION & QUEUE CLEANUP LIFECYCLE');
  console.log('===============================================================\n');

  // 1. Authenticate Admin and Customer
  console.log('1. Authenticating test users...');
  const adminLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  const adminToken = (await adminLogin.json()).data.token;

  const custLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nimal_client', password: 'Password123!' })
  });
  const custData = (await custLogin.json()).data;
  const custToken = custData.token;
  const customerId = custData.user.customerId;
  console.log('   ✓ Admin & Customer authenticated.');

  // 2. Staff Cancels Quick Print Job with Reason
  console.log('\n2. Testing Staff Quick Print Cancellation with Reason...');
  const newQpJob = await QuickPrintJob.create({
    tokenNumber: 'QP-TEST-CANCEL-01',
    customerName: 'Saman Silva',
    customerPhone: '0711112222',
    colorMode: 'BW',
    copies: 2,
    paperSize: 'A4',
    status: 'PENDING',
    customerMessage: 'Please print in grayscale'
  });

  const staffCancelRes = await fetch(`http://localhost:3000/api/quick-print/jobs/${newQpJob.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'CANCELLED', reason: 'Customer walked out (Abandoned)' })
  });
  const staffCancelJson = await staffCancelRes.json();
  const refreshedQp = await QuickPrintJob.findByPk(newQpJob.id);
  if (refreshedQp.status === 'CANCELLED' && refreshedQp.customerMessage.includes('Customer walked out (Abandoned)')) {
    console.log('   ✓ Quick Print job successfully cancelled by staff with reason preserved in message.');
  } else {
    throw new Error('Quick Print cancellation by staff failed.');
  }

  // 3. Clear Abandoned Walk-in Tokens (>24h)
  console.log('\n3. Testing Clear Abandoned Tokens endpoint...');
  // Create an old abandoned token (created 30 hours ago)
  const oldQpJob = await QuickPrintJob.create({
    tokenNumber: 'QP-TEST-OLD-01',
    customerName: 'Abandoned Walkin',
    customerPhone: '0722223333',
    colorMode: 'BW',
    copies: 1,
    paperSize: 'A4',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000)
  });

  const clearRes = await fetch('http://localhost:3000/api/quick-print/clear-abandoned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ hours: 24 })
  });
  const clearJson = await clearRes.json();
  const refreshedOldJob = await QuickPrintJob.findByPk(oldQpJob.id);
  if (refreshedOldJob.status === 'CANCELLED' && refreshedOldJob.customerMessage.includes('AUTO-CANCELLED')) {
    console.log(`   ✓ Clear Abandoned endpoint successfully swept ${clearJson.data.cancelledCount} old token(s).`);
  } else {
    throw new Error('Clear abandoned tokens failed.');
  }

  // 4. Customer Self-Service Order Cancellation (Status: RECEIVED)
  console.log('\n4. Testing Customer Self-Service Order Cancellation (RECEIVED)...');
  const orderRes = await fetch('http://localhost:3000/api/orders/online-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}` },
    body: JSON.stringify({
      customerName: 'Nimal Fernando',
      whatsappNumber: '0775551234',
      productName: 'T-Shirt Printing Test',
      quantity: 1,
      unitPrice: 1500.00
    })
  });
  const createdOrder = (await orderRes.json()).data;

  // Customer cancels their own order
  const custCancelRes = await fetch(`http://localhost:3000/api/orders/${createdOrder.id}/customer-cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}` },
    body: JSON.stringify({ reason: 'Decided to change design next week' })
  });
  const custCancelJson = await custCancelRes.json();
  const refreshedOrder = await Order.findByPk(createdOrder.id);
  if (refreshedOrder.status === 'CANCELLED' && refreshedOrder.notes.includes('Decided to change design next week')) {
    console.log('   ✓ Customer successfully cancelled order before production (notes audit preserved).');
  } else {
    throw new Error('Customer order cancellation failed: ' + JSON.stringify(custCancelJson));
  }

  // 5. Order Cancellation Lock During Production (Status: PRINTING)
  console.log('\n5. Testing Order Cancellation Lock During Production (PRINTING)...');
  const inProdOrder = await Order.create({
    orderNumber: 'ORD-TEST-PROD-01',
    customerId: customerId,
    jobTitle: 'Banner Print Locked Test',
    quantity: 1,
    totalAmount: 2500.00,
    balanceAmount: 2500.00,
    status: 'PRINTING'
  });

  const lockedCancelRes = await fetch(`http://localhost:3000/api/orders/${inProdOrder.id}/customer-cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}` },
    body: JSON.stringify({ reason: 'Try to cancel in printing' })
  });
  const lockedJson = await lockedCancelRes.json();
  if (lockedCancelRes.status === 400 && lockedJson.message.includes('locked')) {
    console.log('   ✓ Cancellation attempt during PRINTING strictly rejected with HTTP 400.');
  } else {
    throw new Error('Locking during production failed.');
  }

  // 6. Customer Quick Print Self-Cancellation
  console.log('\n6. Testing Customer Quick Print Self-Cancellation...');
  const custQp = await QuickPrintJob.create({
    tokenNumber: 'QP-CUST-SELF-01',
    customerName: 'Nimal Fernando',
    customerPhone: '0775551234',
    customerId: customerId,
    colorMode: 'COLOR',
    copies: 1,
    paperSize: 'A4',
    status: 'PENDING'
  });

  const custQpCancelRes = await fetch(`http://localhost:3000/api/quick-print/jobs/${custQp.id}/customer-cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}` },
    body: JSON.stringify({ reason: 'Uploaded wrong document version' })
  });
  const custQpJson = await custQpCancelRes.json();
  const refreshedCustQp = await QuickPrintJob.findByPk(custQp.id);
  if (refreshedCustQp.status === 'CANCELLED' && refreshedCustQp.customerMessage.includes('Uploaded wrong document version')) {
    console.log('   ✓ Customer successfully cancelled their pending Quick Print job.');
  } else {
    throw new Error('Customer Quick Print cancellation failed.');
  }

  // 7. Verify UI Page HTTP Rendering
  console.log('\n7. Verifying UI View Templates with Cancelled Tabs & Buttons...');
  const qpViewRes = await fetch('http://localhost:3000/quick-print', {
    headers: { 'Cookie': `auth_token=${adminToken}` }
  });
  const qpHtml = await qpViewRes.text();
  const hasQpCancelledTab = qpHtml.includes('Cancelled / Unprinted');
  const hasCleanAbandonedBtn = qpHtml.includes('Clean Abandoned (>24h)');
  const hasCancelJobModal = qpHtml.includes('cancelJobModal');

  const ordersViewRes = await fetch('http://localhost:3000/orders', {
    headers: { 'Cookie': `auth_token=${adminToken}` }
  });
  const ordersHtml = await ordersViewRes.text();
  const hasOrdersCancelledTab = ordersHtml.includes('Cancelled (');

  const portalViewRes = await fetch('http://localhost:3000/portal', {
    headers: { 'Cookie': `auth_token=${custToken}` }
  });
  const portalHtml = await portalViewRes.text();
  const hasPortalCancelBtn = portalHtml.includes('Cancel Order') || portalHtml.includes('customerDirectCancelModal');

  console.log(`   ✓ Quick Print Cancelled Tab Present: ${hasQpCancelledTab}`);
  console.log(`   ✓ Quick Print Clean Abandoned (>24h) Button Present: ${hasCleanAbandonedBtn}`);
  console.log(`   ✓ Quick Print Cancel Job Modal Present: ${hasCancelJobModal}`);
  console.log(`   ✓ Orders Cancelled Tab Present: ${hasOrdersCancelledTab}`);
  console.log(`   ✓ Customer Portal Direct Cancel Modal Present: ${hasPortalCancelBtn}`);

  if (!hasQpCancelledTab || !hasCleanAbandonedBtn || !hasCancelJobModal || !hasOrdersCancelledTab || !hasPortalCancelBtn) {
    throw new Error('One or more UI template elements missing.');
  }

  // Cleanup test artifacts
  await inProdOrder.destroy();
  await refreshedOrder.destroy();
  await refreshedQp.destroy();
  await refreshedOldJob.destroy();
  await refreshedCustQp.destroy();

  console.log('\n===============================================================');
  console.log('🎉 ALL CANCELLATION & QUEUE MANAGEMENT TESTS PASSED (100%)!');
  console.log('===============================================================\n');
}

runCancellationTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

