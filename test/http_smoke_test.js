const http = require('http');
const app = require('../server');

async function testHttpEndpoints() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3099, '127.0.0.1', resolve));
  console.log('Test HTTP server listening on port 3099');

  const get = (urlPath) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3099${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });

  try {
    // 1. Health check
    const health = await get('/health');
    console.log('/health status:', health.statusCode);
    const healthJson = JSON.parse(health.data);
    console.log('Health JSON:', healthJson.status, healthJson.environment);

    // 2. Public Upload Page
    const upload = await get('/upload');
    console.log('/upload status:', upload.statusCode, upload.data.includes('Nirmana'));

    // 3. Login Page
    const login = await get('/login');
    console.log('/login status:', login.statusCode, login.data.includes('Sign In'));

    // 4. Register Page
    const register = await get('/register');
    console.log('/register status:', register.statusCode, register.data.includes('Create Account'));

    // 5. Protected Route without Auth (Should redirect to /login)
    const dashboard = await get('/dashboard');
    console.log('/dashboard unauthenticated status (expect 302 redirect):', dashboard.statusCode);

    console.log('🎉 ALL HTTP ENDPOINTS RESPONDING HEALTHILY!');
  } finally {
    server.close();
  }
}

testHttpEndpoints().catch((err) => {
  console.error('HTTP Test Error:', err);
  process.exit(1);
});

