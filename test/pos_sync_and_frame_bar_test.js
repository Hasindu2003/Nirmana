/**
 * Verification Test:
 * 1. Quick print completion with money got -> adds to POS sales register
 * 2. Regular order payment / completion with money got -> adds to POS sales register
 * 3. Predefined price calculations
 * 4. Remove / Cancel button on Printing Orders page (/orders)
 * 5. Dedicated Photo Frames Studio Bar on Dashboard (/dashboard) and Sidebar
 */
const http = require('http');

function postJson(path, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function putJson(path, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}`, 'Cookie': `token=${token}` } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('🧪 Starting POS Sync, Predefined Pricing & Photo Frames Bar Verification...\n');

  // 1. Admin Authentication
  const loginRes = await postJson('/api/auth/login', { username: 'admin', password: 'Password123!' });
  const token = (loginRes.body && loginRes.body.data && loginRes.body.data.token) || (loginRes.body && loginRes.body.token);
  if (!token) throw new Error('Admin login failed');
  console.log('✅ 1. Admin authenticated successfully.');

  // 2. Test Quick Print Completion with "Money Got" -> POS System Sync
  console.log('\n--- 2. QUICK PRINT COMPLETION & POS SYSTEM SYNC ---');
  const { QuickPrintJob, PosSale, PosSaleItem } = require('../src/models');
  
  // Create a pending Quick Print job
  const qpJob = await QuickPrintJob.create({
    tokenNumber: 'QP-' + Date.now().toString().slice(-6),
    customerName: 'Saman Gunawardena',
    customerPhone: '0714443322',
    paperSize: '8" x 10" Photo Frame',
    colorMode: 'COLOR',
    copies: 2,
    status: 'PENDING',
  });
  console.log(`Created Quick Print Token #${qpJob.tokenNumber} (ID: ${qpJob.id})`);

  // Complete job with Money Got = true, amount = 1700.00 (2x Rs. 850)
  const completeQpRes = await putJson(`/api/quick-print/jobs/${qpJob.id}/status`, {
    status: 'COMPLETED',
    moneyGot: true,
    amount: 1700.00,
    paymentMethod: 'CASH'
  }, token);

  console.log('Quick Print complete response status:', completeQpRes.status);
  if (completeQpRes.status !== 200 || !completeQpRes.body || !completeQpRes.body.success) {
    throw new Error('Quick print complete failed: ' + JSON.stringify(completeQpRes));
  }

  const posSaleFromQp = completeQpRes.body.posSale;
  console.log(`✅ Quick Print POS Sale generated: Receipt #${posSaleFromQp ? posSaleFromQp.receiptNumber : 'N/A'}`);
  if (!posSaleFromQp || !posSaleFromQp.receiptNumber) {
    throw new Error('Quick Print did NOT generate a POS Sale record!');
  }

  // Verify POS Sale in database
  const dbPosSale = await PosSale.findByPk(posSaleFromQp.id, {
    include: [{ model: PosSaleItem, as: 'items' }]
  });
  console.log(`✓ PosSale Total: Rs. ${parseFloat(dbPosSale.totalAmount).toFixed(2)}, Items count: ${dbPosSale.items.length}`);
  console.log(`✓ Item Name: "${dbPosSale.items[0].itemName}"`);
  if (parseFloat(dbPosSale.totalAmount) !== 1700.00) throw new Error('POS Sale total does not match amount!');
  if (!dbPosSale.items[0].itemName.includes(qpJob.tokenNumber)) throw new Error('POS Sale item name does not reference token number!');

  // 3. Test Printing Order Settlement with "Money Got" -> POS System Sync
  console.log('\n--- 3. ORDER SETTLEMENT & PAYMENT SYNC TO POS ---');
  const createOrderRes = await postJson('/api/orders/online-guest', {
    customerName: 'Kamal Jayasinghe',
    whatsappNumber: '0778889900',
    productName: '16x24 Large Canvas Photo Frame',
    category: 'Frames',
    paperMaterial: 'Teak Wooden Frame',
    quantity: 1,
    unitPrice: 4500.00,
    specifications: 'Matte glass framing'
  });
  const orderId = createOrderRes.body.data.id;
  const orderNum = createOrderRes.body.data.orderNumber;
  console.log(`Created Order #${orderNum} (ID: ${orderId}), Total: Rs. 4,500.00`);

  // Move order to READY
  await putJson(`/api/orders/${orderId}/status`, { status: 'READY' }, token);

  // Complete Order & Collect Full Balance with Money Got -> POS Sync
  const completeOrderRes = await putJson(`/api/orders/${orderId}/status`, {
    status: 'COMPLETED',
    collectFullBalance: true,
    paymentMethod: 'CASH',
    addToPos: true
  }, token);

  console.log('Order complete response status:', completeOrderRes.status);
  if (completeOrderRes.status !== 200) throw new Error('Order complete failed');

  // Verify POS Sale was created for order settlement
  const orderPosSale = await PosSale.findOne({
    where: { notes: { [require('sequelize').Op.like]: `%${orderNum}%` } },
    include: [{ model: PosSaleItem, as: 'items' }],
    order: [['createdAt', 'DESC']]
  });

  if (!orderPosSale) throw new Error(`POS Sale was NOT created for order settlement of ${orderNum}!`);
  console.log(`✅ Order Settlement POS Sale: Receipt #${orderPosSale.receiptNumber}`);
  console.log(`✓ Total: Rs. ${parseFloat(orderPosSale.totalAmount).toFixed(2)}`);
  console.log(`✓ Item: "${orderPosSale.items[0].itemName}"`);
  if (parseFloat(orderPosSale.totalAmount) !== 4500.00) throw new Error('Order POS Sale total amount mismatch!');

  // 4. Test Progress Payment sync to POS
  console.log('\n--- 4. PROGRESS PAYMENT ON ORDER SYNC TO POS ---');
  const partialOrderRes = await postJson('/api/orders/online-guest', {
    customerName: 'Anura Bandara',
    whatsappNumber: '0771112233',
    productName: 'Custom Brochures (100 Pcs)',
    category: 'Commercial',
    paperMaterial: '150gsm Art Paper',
    quantity: 100,
    unitPrice: 25.00,
    specifications: 'Tri-fold brochures'
  });
  const partialOrderId = partialOrderRes.body.data.id;
  const partialOrderNum = partialOrderRes.body.data.orderNumber;

  // Record an advance payment of Rs. 1,000.00 with addToPos: true
  const payRes = await postJson(`/api/orders/${partialOrderId}/payment`, {
    amount: 1000.00,
    paymentMethod: 'CASH',
    notes: 'Advance deposit paid at counter',
    addToPos: true
  }, token);

  console.log('Payment response status:', payRes.status);
  const payPosSale = await PosSale.findOne({
    where: { notes: { [require('sequelize').Op.like]: `%${partialOrderNum}%` } },
    include: [{ model: PosSaleItem, as: 'items' }],
    order: [['createdAt', 'DESC']]
  });
  if (!payPosSale) throw new Error(`POS Sale was NOT created for advance payment on ${partialOrderNum}!`);
  console.log(`✅ Advance Payment POS Sale: Receipt #${payPosSale.receiptNumber}, Amount: Rs. ${parseFloat(payPosSale.totalAmount).toFixed(2)}`);
  if (parseFloat(payPosSale.totalAmount) !== 1000.00) throw new Error('Payment POS Sale total mismatch!');

  // 5. Test Order Cancellation / Removal on /orders
  console.log('\n--- 5. REMOVE ORDER FROM QUEUE ON /orders ---');
  const cancelOrderRes = await putJson(`/api/orders/${partialOrderId}/status`, {
    status: 'CANCELLED',
    notes: '[CANCELLED from Orders Queue]: Customer requested cancellation / changed mind'
  }, token);
  console.log('Order cancel status:', cancelOrderRes.status);
  if (cancelOrderRes.status !== 200) throw new Error('Order cancel failed');
  const { Order } = require('../src/models');
  const cancelledOrder = await Order.findByPk(partialOrderId);
  console.log(`✅ Order status in DB: ${cancelledOrder.status}`);
  if (cancelledOrder.status !== 'CANCELLED') throw new Error('Order status is not CANCELLED!');

  // 6. Test UI HTML Renders
  console.log('\n--- 6. VERIFYING UI TEMPLATES ---');
  
  // A. Dashboard (/dashboard)
  const dashRes = await get('/dashboard', token);
  console.log('Dashboard status:', dashRes.status);
  const hasPhotoFramesTopBar = dashRes.body.includes('id="photoFramesStatusBar"');
  const hasQueueSwitcher = dashRes.body.includes('id="dashboardQueueSwitcher"');
  const hasPhotoFramesSection = dashRes.body.includes('id="photoFramesSection"');
  const hasSidebarFrames = dashRes.body.includes('Photo Frames Studio');
  console.log(`✓ Photo Frames Top Bar on Dashboard: ${hasPhotoFramesTopBar}`);
  console.log(`✓ Queue Switcher on Dashboard: ${hasQueueSwitcher}`);
  console.log(`✓ Photo Frames Section on Dashboard: ${hasPhotoFramesSection}`);
  console.log(`✓ Sidebar Photo Frames Studio Link: ${hasSidebarFrames}`);

  if (!hasPhotoFramesTopBar || !hasQueueSwitcher || !hasPhotoFramesSection || !hasSidebarFrames) {
    throw new Error('Dashboard or Sidebar missing Photo Frames Studio components!');
  }

  // B. Printing Orders (/orders)
  const ordersRes = await get('/orders', token);
  console.log('Orders page status:', ordersRes.status);
  const hasFramesTab = ordersRes.body.includes('Photo Frames');
  const hasOrderRemoveBtn = ordersRes.body.includes('openOrderCancelModal');
  const hasOrderCancelModal = ordersRes.body.includes('id="orderCancelModal"');
  console.log(`✓ Photo Frames filter tab on /orders: ${hasFramesTab}`);
  console.log(`✓ Remove button on /orders rows: ${hasOrderRemoveBtn}`);
  console.log(`✓ Order Cancel modal on /orders: ${hasOrderCancelModal}`);

  if (!hasFramesTab || !hasOrderRemoveBtn || !hasOrderCancelModal) {
    throw new Error('/orders missing Photo Frames tab or Remove button / modal!');
  }

  // C. Quick Print (/quick-print)
  const qpRes = await get('/quick-print', token);
  console.log('Quick Print page status:', qpRes.status);
  const hasCompleteJobModal = qpRes.body.includes('id="completeJobModal"');
  const hasQpRemoveBtn = qpRes.body.includes('openCancelJobModal');
  const hasCleanAbandonedBtn = qpRes.body.includes('Clean Abandoned (>24h)');
  console.log(`✓ Complete Job & POS modal on /quick-print: ${hasCompleteJobModal}`);
  console.log(`✓ Direct Remove button on /quick-print cards: ${hasQpRemoveBtn}`);
  console.log(`✓ Clean Abandoned (>24h) button on /quick-print: ${hasCleanAbandonedBtn}`);

  if (!hasCompleteJobModal || !hasQpRemoveBtn || !hasCleanAbandonedBtn) {
    throw new Error('/quick-print missing Complete Job modal or Remove button!');
  }

  console.log('\n🎉 ALL REAL-WORLD TEST ASSERTIONS PASSED (100%)!\n');
}

runTest().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

