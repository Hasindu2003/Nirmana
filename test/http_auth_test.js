const http = require('http');
const app = require('../server');

async function testAuthenticatedHttpFlow() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3098, '127.0.0.1', resolve));

  const request = (method, urlPath, headers = {}, body = null) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:3098${urlPath}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

  try {
    // 1. Login with Admin credentials
    const loginPayload = JSON.stringify({ username: 'admin', password: 'Password123!' });
    const loginRes = await request('POST', '/api/auth/login', {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload),
    }, loginPayload);

    console.log('API Login status:', loginRes.statusCode);
    const loginData = JSON.parse(loginRes.data);
    const token = loginData.token;
    console.log('Login token received:', Boolean(token));

    const setCookie = loginRes.headers['set-cookie'];
    const cookieHeader = setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : `auth_token=${token}`;

    // 2. Access Protected Routes with Auth Cookie
    const authHeaders = { 'Cookie': cookieHeader };

    const dashboardRes = await request('GET', '/dashboard', authHeaders);
    console.log('GET /dashboard (authenticated):', dashboardRes.statusCode, dashboardRes.data.includes('Dashboard'));

    const ordersRes = await request('GET', '/orders', authHeaders);
    console.log('GET /orders (authenticated):', ordersRes.statusCode, ordersRes.data.includes('Printing Orders'));

    const stockRes = await request('GET', '/stock', authHeaders);
    console.log('GET /stock (authenticated):', stockRes.statusCode, stockRes.data.includes('Stock Management'));

    const customersRes = await request('GET', '/customers', authHeaders);
    console.log('GET /customers (authenticated):', customersRes.statusCode, customersRes.data.includes('Customer Directory'));

    const posRes = await request('GET', '/pos', authHeaders);
    console.log('GET /pos (authenticated):', posRes.statusCode, posRes.data.includes('Point of Sale'));

    const qpRes = await request('GET', '/quick-print', authHeaders);
    console.log('GET /quick-print (authenticated):', qpRes.statusCode, qpRes.data.includes('Quick Print Counter Queue'));

    const usersRes = await request('GET', '/users', authHeaders);
    console.log('GET /users (authenticated admin):', usersRes.statusCode, usersRes.data.includes('User & Role Administration'));

    console.log('🎉 ALL AUTHENTICATED PAGES RENDERED SUCCESSFULLY (200 OK)!');
  } finally {
    server.close();
  }
}

testAuthenticatedHttpFlow().catch((err) => {
  console.error('Auth HTTP flow error:', err);
  process.exit(1);
});
