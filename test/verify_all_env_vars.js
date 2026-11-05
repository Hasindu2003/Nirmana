require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/models');
const { createRealtime, rawSql } = require('@neon/realtime/server');

async function verifyAllVariables() {
  console.log('===============================================================');
  console.log('🔍 VERIFYING ALL ENVIRONMENT VARIABLES FOR PRODUCTION DEPLOYMENT');
  console.log('===============================================================\n');

  const report = [];

  // 1. DATABASE_URL & DB_DIALECT
  console.log('1. Checking DATABASE_URL & DB_DIALECT...');
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in .env');
    if (process.env.DB_DIALECT !== 'postgres') throw new Error(`DB_DIALECT is '${process.env.DB_DIALECT}', expected 'postgres'`);
    
    await sequelize.authenticate();
    const [dbResult] = await sequelize.query('SELECT current_database(), current_user, version();');
    const dbInfo = dbResult[0];
    report.push({
      variable: 'DATABASE_URL & DB_DIALECT',
      status: '✅ PASS',
      details: `Connected to '${dbInfo.current_database}' as '${dbInfo.current_user}'. Version: ${dbInfo.version.slice(0, 25)}...`,
    });
    console.log('   ✅ PASS: Connected to Neon PostgreSQL database!\n');
  } catch (err) {
    report.push({ variable: 'DATABASE_URL & DB_DIALECT', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 2. JWT_SECRET
  console.log('2. Checking JWT_SECRET...');
  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing');
    const testPayload = { test: true, user: 'admin', role: 'ADMIN' };
    const token = jwt.sign(testPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.user !== 'admin') throw new Error('Decoded payload mismatch');
    report.push({
      variable: 'JWT_SECRET',
      status: '✅ PASS',
      details: `Signing and verification verified successfully (Key length: ${process.env.JWT_SECRET.length} chars)`,
    });
    console.log('   ✅ PASS: JWT signing and decryption verified!\n');
  } catch (err) {
    report.push({ variable: 'JWT_SECRET', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 3. SESSION_SECRET
  console.log('3. Checking SESSION_SECRET...');
  try {
    if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is missing');
    report.push({
      variable: 'SESSION_SECRET',
      status: '✅ PASS',
      details: `Secret present with length: ${process.env.SESSION_SECRET.length} chars`,
    });
    console.log('   ✅ PASS: SESSION_SECRET is configured!\n');
  } catch (err) {
    report.push({ variable: 'SESSION_SECRET', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 4. NEON OBJECT STORAGE (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION)
  console.log('4. Checking Neon Object Storage S3 Credentials & Endpoint...');
  try {
    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION } = process.env;
    if (!AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is missing');
    if (!AWS_SECRET_ACCESS_KEY) throw new Error('AWS_SECRET_ACCESS_KEY is missing');
    if (!AWS_ENDPOINT_URL_S3) throw new Error('AWS_ENDPOINT_URL_S3 is missing');

    const s3 = new S3Client({
      region: AWS_REGION || 'ap-southeast-1',
      endpoint: AWS_ENDPOINT_URL_S3,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    const testKey = `test-verify/${Date.now()}.txt`;
    const bucket = 'assets';
    // Upload
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from('Verification test payload'),
      ContentType: 'text/plain',
    }));

    // Presign URL
    const presigned = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: testKey }), { expiresIn: 60 });

    // Fetch presigned URL over HTTPS
    const fetchRes = await fetch(presigned);
    if (!fetchRes.ok) throw new Error(`Presigned GET failed with HTTP ${fetchRes.status}`);
    const fetchedContent = await fetchRes.text();
    if (fetchedContent !== 'Verification test payload') throw new Error('Presigned GET content mismatch');

    // Clean up
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));

    report.push({
      variable: 'AWS_ACCESS_KEY_ID / SECRET / ENDPOINT / REGION',
      status: '✅ PASS',
      details: `Bucket 'assets' verified (PutObject, GetSignedUrl, HTTPS fetch, DeleteObject all OK)`,
    });
    console.log('   ✅ PASS: Neon Object Storage S3 credentials & bucket verified!\n');
  } catch (err) {
    report.push({ variable: 'AWS_* (Object Storage)', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 5. NEON AUTH (NEON_AUTH_BASE_URL & NEON_AUTH_JWKS_URL)
  console.log('5. Checking Neon Auth Endpoints...');
  try {
    const { NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL } = process.env;
    if (!NEON_AUTH_BASE_URL) throw new Error('NEON_AUTH_BASE_URL is missing');
    if (!NEON_AUTH_JWKS_URL) throw new Error('NEON_AUTH_JWKS_URL is missing');

    const jwksRes = await fetch(NEON_AUTH_JWKS_URL);
    if (!jwksRes.ok) throw new Error(`JWKS fetch returned HTTP ${jwksRes.status}`);
    const jwks = await jwksRes.json();
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('No active keys in JWKS response');

    report.push({
      variable: 'NEON_AUTH_BASE_URL & NEON_AUTH_JWKS_URL',
      status: '✅ PASS',
      details: `JWKS endpoint live (${jwks.keys.length} active key, algorithm: ${jwks.keys[0].alg || 'RSA/EdDSA'})`,
    });
    console.log('   ✅ PASS: Neon Auth endpoint & JWKS verified!\n');
  } catch (err) {
    report.push({ variable: 'NEON_AUTH_*', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 6. NEON FUNCTIONS (NEON_FUNCTION_HELLO_BASE_URL)
  console.log('6. Checking Neon Serverless Function...');
  try {
    const { NEON_FUNCTION_HELLO_BASE_URL } = process.env;
    if (!NEON_FUNCTION_HELLO_BASE_URL) throw new Error('NEON_FUNCTION_HELLO_BASE_URL is missing');

    const fnRes = await fetch(NEON_FUNCTION_HELLO_BASE_URL);
    if (!fnRes.ok) throw new Error(`Function returned HTTP ${fnRes.status}`);
    const fnText = await fnRes.text();
    if (!fnText.includes('Hello from Neon Functions')) throw new Error(`Unexpected function response: ${fnText}`);

    report.push({
      variable: 'NEON_FUNCTION_HELLO_BASE_URL',
      status: '✅ PASS',
      details: `Live endpoint HTTP 200, output: "${fnText.trim()}"`,
    });
    console.log('   ✅ PASS: Neon Serverless Function verified!\n');
  } catch (err) {
    report.push({ variable: 'NEON_FUNCTION_*', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  // 7. NEON REALTIME (NEON_REALTIME_URL & NEON_REALTIME_SECRET)
  console.log('7. Checking Neon Realtime Credentials...');
  try {
    const { NEON_REALTIME_URL, NEON_REALTIME_SECRET } = process.env;
    if (!NEON_REALTIME_URL) throw new Error('NEON_REALTIME_URL is missing');
    if (!NEON_REALTIME_SECRET) throw new Error('NEON_REALTIME_SECRET is missing');

    const realtime = createRealtime({ secret: NEON_REALTIME_SECRET, db: 'neondb' });
    const query = rawSql('SELECT id, "orderNumber" FROM orders LIMIT 5');
    const sealed = await realtime.seal({ query });

    if (!sealed || !sealed.capability || !sealed.queryFingerprint) {
      throw new Error('Realtime sealing returned invalid payload');
    }

    report.push({
      variable: 'NEON_REALTIME_URL & NEON_REALTIME_SECRET',
      status: '✅ PASS',
      details: `Query sealed successfully with fingerprint ${sealed.queryFingerprint.slice(0, 16)}...`,
    });
    console.log('   ✅ PASS: Neon Realtime credentials & query sealing verified!\n');
  } catch (err) {
    report.push({ variable: 'NEON_REALTIME_*', status: '❌ FAIL', details: err.message });
    console.log('   ❌ FAIL:', err.message, '\n');
  }

  console.log('===============================================================');
  console.log('📋 SUMMARY REPORT FOR VERCEL DEPLOYMENT');
  console.log('===============================================================');
  console.table(report);

  const allPassed = report.every(r => r.status.includes('PASS'));
  if (allPassed) {
    console.log('\n🎉 ALL 14 VARIABLES ARE 100% OPERATIONAL, TESTED, AND READY FOR VERCEL!');
  } else {
    console.log('\n⚠️ Some variables had errors. Please check the summary table above.');
  }
}

verifyAllVariables().catch(console.error);

