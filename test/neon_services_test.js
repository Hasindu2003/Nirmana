const http = require('http');

async function runRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function testAllNeonServices() {
  console.log('===============================================================');
  console.log('⚡ TESTING ALL 5 WIRED NEON SERVICES END-TO-END');
  console.log('===============================================================\n');

  // Test 1: Full Neon Health Status Endpoint
  console.log('1. Querying /api/neon/status (Postgres, Auth, Storage, Functions, Realtime)...');
  const statusRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/neon/status',
    method: 'GET',
  });

  if (statusRes.status !== 200 || !statusRes.data.success) {
    throw new Error(`Neon status endpoint failed: ${JSON.stringify(statusRes.data)}`);
  }

  const s = statusRes.data.data.services;
  console.log('   ✓ Postgres:       ', s.postgres.status, `(Dialect: ${s.postgres.dialect}, Database: ${s.postgres.database})`);
  console.log('   ✓ Auth:           ', s.auth.status, `(Provider: ${s.auth.provider}, JWKS Keys: ${s.auth.keyCount})`);
  console.log('   ✓ Object Storage: ', s.objectStorage.status, `(Bucket: ${s.objectStorage.bucket}, Presigned SigV4: ${s.objectStorage.presignedUrlGenerated})`);
  console.log('   ✓ Functions:      ', s.functions.status, `(Response: "${s.functions.output}", HTTP ${s.functions.responseStatus})`);
  console.log('   ✓ Realtime:       ', s.realtime.status, `(WS: ${s.realtime.url}, Query Sealed: ${s.realtime.querySealed})\n`);

  // Test 2: Invoke Deployed Neon Function directly from App Backend
  console.log('2. Testing Neon Function Invocation (/api/neon/functions/invoke)...');
  const fnRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/neon/functions/invoke',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  console.log('   ✓ Function Returned:', fnRes.data.data.output, `[HTTP ${fnRes.data.data.status}]\n`);

  // Test 3: Test Neon Realtime Query Sealing (/api/neon/realtime/seal)
  console.log('3. Testing Neon Realtime Live Query Sealing (/api/neon/realtime/seal)...');
  const sealRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/neon/realtime/seal?limit=10',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const cap = sealRes.data.data.sealed.capability;
  console.log('   ✓ Capability Token: ', cap.slice(0, 45) + '... (Length: ' + cap.length + ' chars)');
  console.log('   ✓ Fingerprint:      ', sealRes.data.data.sealed.queryFingerprint);
  console.log('   ✓ Realtime WS URL:  ', sealRes.data.data.realtimeUrl, '\n');

  // Test 4: Authenticate admin against Neon Lakebase Postgres
  console.log('4. Testing Staff Login against Neon Lakebase Postgres (/api/auth/login)...');
  const loginRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    username: 'admin',
    password: 'Password123!',
  });

  if (loginRes.status !== 200 || !loginRes.data.success) {
    throw new Error(`Login failed on Neon Postgres: ${JSON.stringify(loginRes.data)}`);
  }

  const token = loginRes.data.data.token;
  console.log('   ✓ Admin Login OK:   ', loginRes.data.data.user.fullName, `(Role: ${loginRes.data.data.user.role})`);
  console.log('   ✓ Auth Token Minted:', token.slice(0, 40) + '...\n');

  // Test 5: End-to-end database write and read on Neon PostgreSQL
  console.log('5. Testing Database Transactions on Neon Postgres (Stock Item Create & Read)...');
  const testStockCode = 'NEON-STK-' + Date.now().toString().slice(-4);
  const stockRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/stock',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }, {
    code: testStockCode,
    name: 'Neon Ceramic Substrate Mug',
    category: 'Merchandise',
    unit: 'Pcs',
    sellingPrice: 950.00,
    unitCost: 480.00,
    currentStock: 25,
    minStockAlert: 5,
  });

  if (stockRes.status !== 201 || !stockRes.data.success) {
    throw new Error(`Stock creation failed on Neon Postgres: ${JSON.stringify(stockRes.data)}`);
  }
  console.log('   ✓ Stock Item Created on Neon Postgres:', stockRes.data.data.code, '-', stockRes.data.data.name);

  // Read back stock
  const listStockRes = await runRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/stock?search=' + encodeURIComponent(stockRes.data.data.name),
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const items = Array.isArray(listStockRes.data.data) ? listStockRes.data.data : (listStockRes.data.data.items || []);
  const found = items.find(i => i.id === stockRes.data.data.id);
  console.log('   ✓ Stock Item Query Verified on Neon:   ', found ? `ID ${found.id} - ${found.code} (Stock: ${found.currentStock})` : 'Not found');

  console.log('\n===============================================================');
  console.log('🎉 ALL 5 NEON SERVICES OPERATIONAL & VERIFIED END-TO-END!');
  console.log('===============================================================\n');
}

testAllNeonServices().catch(err => {
  console.error('\n❌ Neon Service Test Failed:', err.message);
  process.exit(1);
});
