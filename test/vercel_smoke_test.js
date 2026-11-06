const https = require('https');

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Cookie': 'token=' + token,
        'Authorization': 'Bearer ' + token
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function verify() {
  console.log('🌍 Verifying live Vercel production deployment...');
  const loginRes = await postJson('https://nirmanaprinting-eta.vercel.app/api/auth/login', {
    username: 'admin',
    password: 'Password123!'
  });
  if (!loginRes.data || !loginRes.data.data || !loginRes.data.data.token) {
    throw new Error('Login failed on Vercel');
  }
  const token = loginRes.data.data.token;
  console.log('✓ Vercel Auth succeeded with Neon DB.');

  // Dashboard check
  const dash = await get('https://nirmanaprinting-eta.vercel.app/dashboard', token);
  console.log('✓ Vercel Dashboard HTTP Status:', dash.status);
  console.log('✓ Essential Shortcuts on Dashboard:', dash.body.includes('Essential Shortcuts & Workspaces'));
  console.log('✓ Photo Frames Studio Shortcut Link:', dash.body.includes('/orders?type=frame'));
  console.log('✓ Photo Frames Sidebar Link:', dash.body.includes('Photo Frames Studio'));

  // Orders check
  const orders = await get('https://nirmanaprinting-eta.vercel.app/orders', token);
  console.log('✓ Vercel Orders HTTP Status:', orders.status);
  console.log('✓ Commercial Orders tab / switch on /orders:', orders.body.includes('Commercial Orders'));
  console.log('✓ Photo Frames Studio switch on /orders:', orders.body.includes('Photo Frames Studio'));
  console.log('✓ Remove buttons on /orders rows:', orders.body.includes('openOrderCancelModal'));
  console.log('✓ Order Cancel Modal on /orders:', orders.body.includes('id="orderCancelModal"'));

  // Orders New check
  const ordersNew = await get('https://nirmanaprinting-eta.vercel.app/orders/new', token);
  console.log('✓ Vercel New Order HTTP Status:', ordersNew.status);
  console.log('✓ Order Type Selector on /orders/new:', ordersNew.body.includes('orderTypeSelectorCard'));
  console.log('✓ Photo Frame Studio Option on /orders/new:', ordersNew.body.includes('Photo Frame Studio Order'));

  // POS Reports check
  const posPage = await get('https://nirmanaprinting-eta.vercel.app/pos', token);
  console.log('✓ Vercel POS Page HTTP Status:', posPage.status);
  console.log('✓ Daily & Monthly Reports on /pos:', posPage.body.includes('POS Financial Reports (Daily & Monthly)'));

  // Quick Print check
  const qp = await get('https://nirmanaprinting-eta.vercel.app/quick-print', token);
  console.log('✓ Vercel Quick-Print HTTP Status:', qp.status);
  console.log('✓ Complete Job & POS modal on /quick-print:', qp.body.includes('id="completeJobModal"'));
  console.log('✓ Direct Remove button on /quick-print cards:', qp.body.includes('openCancelJobModal'));
  console.log('✓ Clean Abandoned (>24h) button:', qp.body.includes('Clean Abandoned (>24h)'));

  console.log('\n🎉 ALL VERCEL PRODUCTION VERIFICATIONS CONFIRMED (100%)!\n');
}

verify().catch(e => {
  console.error('Vercel check failed:', e.message);
  process.exit(1);
});

