/**
 * Verification Test: Dashboard Photo Frames Separation & Queue Removal
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
  console.log('🧪 Starting Photo Frame Separation & Queue Removal Verification...');

  // 1. Login as Admin
  const loginRes = await postJson('/api/auth/login', { username: 'admin', password: 'Password123!' });
  const token = (loginRes.body && loginRes.body.data && loginRes.body.data.token) || (loginRes.body && loginRes.body.token);
  if (!token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  }
  console.log('✅ 1. Admin authenticated successfully.');

  // 2. Create a Photo Frame Order
  const frameOrderRes = await postJson('/api/orders/online-guest', {
    customerName: 'Test Frame Customer',
    whatsappNumber: '0719998888',
    productName: '12x18 Teak Wood Photo Frame',
    category: 'Frames',
    paperMaterial: 'Teak Wooden Frame with Glass',
    quantity: 1,
    unitPrice: 3500.00,
    specifications: 'Golden border with anti-reflective glass mounting'
  });
  console.log('✅ 2. Frame order placed:', frameOrderRes.body.data.orderNumber, 'ID:', frameOrderRes.body.data.id);
  const frameOrderId = frameOrderRes.body.data.id;
  const frameOrderNum = frameOrderRes.body.data.orderNumber;

  // 3. Create an Ordinary Order (Mugs / Books)
  const mugOrderRes = await postJson('/api/orders/online-guest', {
    customerName: 'Test Mug Customer',
    whatsappNumber: '0719997777',
    productName: 'Custom Ceramic Mug',
    category: 'Mugs',
    paperMaterial: 'Ceramic White Mug',
    quantity: 5,
    unitPrice: 850.00,
    specifications: 'Color printed logo on mug'
  });
  console.log('✅ 3. Ordinary print order placed:', mugOrderRes.body.data.orderNumber, 'ID:', mugOrderRes.body.data.id);
  const mugOrderId = mugOrderRes.body.data.id;
  const mugOrderNum = mugOrderRes.body.data.orderNumber;

  // 4. Test Dashboard Service directly via require
  const dashboardService = require('../src/services/dashboardService');
  const stats = await dashboardService.getDashboardStats();

  console.log('\n--- VERIFYING DASHBOARD PARTITIONING ---');
  console.log(`Total recentFrameOrders: ${stats.recentFrameOrders.length}`);
  console.log(`Total recentOrdinaryOrders: ${stats.recentOrdinaryOrders.length}`);

  // Frame order must be in stats.recentFrameOrders
  const foundInFrame = stats.recentFrameOrders.some(o => o.id === frameOrderId || o.orderNumber === frameOrderNum);
  const foundInOrdinary = stats.recentOrdinaryOrders.some(o => o.id === frameOrderId || o.orderNumber === frameOrderNum);
  console.log(`Frame order in recentFrameOrders: ${foundInFrame ? 'YES (CORRECT)' : 'NO (ERROR)'}`);
  console.log(`Frame order in recentOrdinaryOrders: ${foundInOrdinary ? 'YES (ERROR)' : 'NO (CORRECT)'}`);

  if (!foundInFrame) throw new Error('Frame order was NOT found in recentFrameOrders!');
  if (foundInOrdinary) throw new Error('Frame order was INCORRECTLY found in recentOrdinaryOrders!');

  // Mug order must be in stats.recentOrdinaryOrders
  const mugInFrame = stats.recentFrameOrders.some(o => o.id === mugOrderId || o.orderNumber === mugOrderNum);
  const mugInOrdinary = stats.recentOrdinaryOrders.some(o => o.id === mugOrderId || o.orderNumber === mugOrderNum);
  console.log(`Mug order in recentOrdinaryOrders: ${mugInOrdinary ? 'YES (CORRECT)' : 'NO (ERROR)'}`);
  console.log(`Mug order in recentFrameOrders: ${mugInFrame ? 'YES (ERROR)' : 'NO (CORRECT)'}`);

  if (!mugInOrdinary) throw new Error('Mug order was NOT found in recentOrdinaryOrders!');
  if (mugInFrame) throw new Error('Mug order was INCORRECTLY found in recentFrameOrders!');

  // 5. Test HTTP GET /dashboard rendering
  const dashHtmlRes = await get('/dashboard', token);
  if (dashHtmlRes.status !== 200) throw new Error(`Dashboard GET returned status ${dashHtmlRes.status}`);

  // Check HTML for both section headers
  const hasFrameSection = dashHtmlRes.body.includes('Photo Frames & Custom Framing Studio Queue');
  const hasOrdinarySection = dashHtmlRes.body.includes('General Printing Orders (Mugs, Books, Cards, Banners)');
  const hasRemoveButtons = dashHtmlRes.body.includes('openDashboardCancelModal');
  const hasCancelModal = dashHtmlRes.body.includes('id="dashboardCancelModal"');

  console.log('\n--- VERIFYING DASHBOARD HTML RENDER ---');
  console.log(`Photo Frame Section rendered: ${hasFrameSection ? 'YES' : 'NO'}`);
  console.log(`General Printing Section rendered: ${hasOrdinarySection ? 'YES' : 'NO'}`);
  console.log(`Individual Remove buttons rendered: ${hasRemoveButtons ? 'YES' : 'NO'}`);
  console.log(`Queue Removal modal rendered: ${hasCancelModal ? 'YES' : 'NO'}`);

  if (!hasFrameSection || !hasOrdinarySection || !hasRemoveButtons || !hasCancelModal) {
    throw new Error('Dashboard HTML missing one or more required components!');
  }

  // 6. Test Quick Print HTML for direct Remove buttons and Clean Abandoned button
  const qpHtmlRes = await get('/quick-print', token);
  const hasCleanAbandoned = qpHtmlRes.body.includes('Clean Abandoned (>24h)');
  const hasDirectRemoveBtn = qpHtmlRes.body.includes('openCancelJobModal');

  console.log('\n--- VERIFYING QUICK PRINT QUEUE ---');
  console.log(`Clean Abandoned (>24h) button present: ${hasCleanAbandoned ? 'YES' : 'NO'}`);
  console.log(`Direct Remove button present: ${hasDirectRemoveBtn ? 'YES' : 'NO'}`);

  if (!hasCleanAbandoned) throw new Error('Clean Abandoned (>24h) button is missing from /quick-print!');
  if (!hasDirectRemoveBtn) throw new Error('Direct Remove button is missing from /quick-print!');

  // 7. Test Removing Order from Queue (via PUT /api/orders/:id/status with CANCELLED)
  const cancelRes = await putJson(`/api/orders/${frameOrderId}/status`, {
    status: 'CANCELLED',
    notes: '[CANCELLED from Dashboard Queue]: Test cancellation verification'
  }, token);

  console.log('\n--- VERIFYING ORDER REMOVAL ---');
  console.log(`Cancel Order Response: ${cancelRes.status} (Success: ${cancelRes.body && cancelRes.body.success})`);
  if (cancelRes.status !== 200 || !cancelRes.body || !cancelRes.body.success) {
    throw new Error('Order cancellation failed: ' + JSON.stringify(cancelRes));
  }

  // Check stats again to ensure order is marked CANCELLED
  const updatedStats = await dashboardService.getDashboardStats();
  const updatedFrameOrder = updatedStats.recentOrders.find(o => o.id === frameOrderId);
  console.log(`Order status in DB: ${updatedFrameOrder ? updatedFrameOrder.status : 'not found'}`);
  if (!updatedFrameOrder || updatedFrameOrder.status !== 'CANCELLED') {
    throw new Error('Order status was not updated to CANCELLED!');
  }

  console.log('\n🎉 ALL PHOTO FRAME SEPARATION & QUEUE REMOVAL TESTS PASSED SUCCESSFULLY! (100%)\n');
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
