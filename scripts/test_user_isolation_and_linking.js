const assert = require('assert');
const http = require('http');
const app = require('../server');
const { sequelize, User, Customer, Order, QuickPrintJob, QuickPrintFile, PhoneVerification } = require('../src/models');
const phoneVerificationService = require('../src/services/phoneVerificationService');
const authService = require('../src/services/authService');

async function runTests() {
  console.log('--- STARTING VERIFICATION TESTS ---');

  // Start temporary HTTP test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running on ${baseUrl}`);

  try {
    // 1. Test Phone Verification Service (OTP)
    console.log('\n1. Testing OTP Generation & Verification...');
    const testPhone = '0779998888';

    await PhoneVerification.sync().catch(() => {});
    // Clear previous test verification records for clean test
    await PhoneVerification.destroy({ where: { phone: testPhone } }).catch(() => {});
    await User.destroy({ where: { phone: testPhone } }).catch(() => {});
    await Customer.destroy({ where: { phone: testPhone } }).catch(() => {});

    const otpRes = await phoneVerificationService.sendOtp(testPhone);
    assert.strictEqual(otpRes.success, true);
    assert.ok(otpRes.devOtp, 'devOtp should be provided in sandbox/dev mode');
    console.log('✓ OTP generated successfully:', otpRes.devOtp);

    // Rate-limiting check
    let rateLimitCaught = false;
    try {
      await phoneVerificationService.sendOtp(testPhone);
    } catch (err) {
      rateLimitCaught = true;
      console.log('✓ Rate limiting caught correctly:', err.message);
    }
    assert.ok(rateLimitCaught, 'Resending OTP within 45s should be blocked');

    // Wrong code check
    let wrongCodeCaught = false;
    try {
      await phoneVerificationService.verifyOtp(testPhone, '000000');
    } catch (err) {
      wrongCodeCaught = true;
    }
    assert.ok(wrongCodeCaught, 'Wrong OTP should be rejected');

    // Correct code check
    const verifyRes = await phoneVerificationService.verifyOtp(testPhone, otpRes.devOtp);
    assert.strictEqual(verifyRes.verified, true);
    const isVerifiedNow = await phoneVerificationService.isPhoneVerified(testPhone);
    assert.strictEqual(isVerifiedNow, true);
    console.log('✓ OTP verified successfully!');

    // 2. Test Retroactive Linking:
    // Create an unlinked guest order and quick print job with phone 0779998888 BEFORE registration
    console.log('\n2. Testing Previous Order & Quick Print Creation before registration...');
    const guestOrderFetch = await fetch(`${baseUrl}/api/orders/online-guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sunil Perera',
        phone: testPhone,
        itemTitle: 'Brochure Printing A4',
        quantity: 50,
        unitPrice: 25.00,
        notes: 'Please print in full color',
      }),
    });
    assert.strictEqual(guestOrderFetch.status, 201);
    const guestOrderData = await guestOrderFetch.json();
    const createdGuestOrder = guestOrderData.data;
    console.log('✓ Guest order created:', createdGuestOrder.orderNumber);

    // Create Quick Print Job with the same phone
    const testJob = await QuickPrintJob.create({
      tokenNumber: `QP-TEST-${Date.now().toString().slice(-4)}`,
      customerName: 'Sunil Perera',
      customerPhone: testPhone,
      paperSize: 'A4',
      colorMode: 'COLOR',
      copies: 5,
      status: 'PENDING',
      customerId: null,
    });
    console.log('✓ Pre-registration Quick Print job created:', testJob.tokenNumber);

    // Now register customer Sunil with phone 0779998888
    console.log('\n3. Testing Late Customer Registration and Automatic Retroactive Linking...');
    const regResult = await authService.registerCustomer({
      fullName: 'Sunil Perera',
      phone: testPhone,
      username: 'sunil_perera_' + Date.now().toString().slice(-4),
      password: 'Password123!',
      email: 'sunil@example.com',
    });

    assert.strictEqual(regResult.isCustomer, true);
    const registeredCustomerId = regResult.customer.id;
    console.log('✓ Customer registered with ID:', registeredCustomerId);

    // Verify that the guest order is now retroactively linked to the new customer
    const linkedOrder = await Order.findByPk(createdGuestOrder.id);
    assert.strictEqual(linkedOrder.customerId, registeredCustomerId);
    console.log('✓ Historical Order successfully linked to customer ID:', linkedOrder.customerId);

    // Verify that the quick print job is now retroactively linked to the new customer
    const linkedJob = await QuickPrintJob.findByPk(testJob.id);
    assert.strictEqual(linkedJob.customerId, registeredCustomerId);
    console.log('✓ Historical Quick Print Job successfully linked to customer ID:', linkedJob.customerId);

    // 3. Test Customer Role Dashboard & Route Isolation
    console.log('\n4. Testing Role Route Isolation...');
    const customerToken = regResult.token;
    const cookieHeader = `auth_token=${customerToken}`;

    // Helper for manual redirect checking
    async function checkRedirect(path) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { Cookie: cookieHeader },
        redirect: 'manual',
      });
      return res;
    }

    // Attempt to access staff dashboard as Customer -> should redirect to /portal
    const dashRes = await checkRedirect('/dashboard');
    assert.strictEqual(dashRes.status, 302);
    assert.strictEqual(dashRes.headers.get('location'), '/portal');
    console.log('✓ Customer accessing /dashboard is redirected to /portal');

    // Attempt to access staff orders page as Customer -> should redirect to /portal
    const ordersRes = await checkRedirect('/orders');
    assert.strictEqual(ordersRes.status, 302);
    assert.strictEqual(ordersRes.headers.get('location'), '/portal');
    console.log('✓ Customer accessing /orders is redirected to /portal');

    // Attempt to access staff stock page as Customer -> should redirect to /portal
    const stockRes = await checkRedirect('/stock');
    assert.strictEqual(stockRes.status, 302);
    assert.strictEqual(stockRes.headers.get('location'), '/portal');
    console.log('✓ Customer accessing /stock is redirected to /portal');

    // Attempt to access staff POS as Customer -> should redirect to /portal
    const posRes = await checkRedirect('/pos');
    assert.strictEqual(posRes.status, 302);
    assert.strictEqual(posRes.headers.get('location'), '/portal');
    console.log('✓ Customer accessing /pos is redirected to /portal');

    // Attempt to access staff quick-print as Customer -> should redirect to /portal
    const qpRes = await checkRedirect('/quick-print');
    assert.strictEqual(qpRes.status, 302);
    assert.strictEqual(qpRes.headers.get('location'), '/portal');
    console.log('✓ Customer accessing /quick-print is redirected to /portal');

    // Attempt to access API staff endpoint as Customer -> should return 403 Forbidden
    const apiStatsRes = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(apiStatsRes.status, 403);
    console.log('✓ Customer accessing /api/dashboard/stats is rejected with 403');

    const apiStockRes = await fetch(`${baseUrl}/api/stock`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(apiStockRes.status, 403);
    console.log('✓ Customer accessing /api/stock is rejected with 403');

    // Customer Portal access -> should return 200 OK and show customer orders & quick jobs
    const portalRes = await fetch(`${baseUrl}/portal`, {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(portalRes.status, 200);
    const portalHtml = await portalRes.text();
    assert.ok(portalHtml.includes(createdGuestOrder.orderNumber), 'Portal must include previous order number');
    assert.ok(portalHtml.includes(testJob.tokenNumber), 'Portal must include previous quick print token');
    console.log('✓ Customer Portal renders with 200 OK and displays BOTH previous order and quick print submission!');

    // Clean up test data
    await Order.destroy({ where: { id: createdGuestOrder.id } }).catch(() => {});
    await QuickPrintJob.destroy({ where: { id: testJob.id } }).catch(() => {});
    await User.destroy({ where: { phone: testPhone } }).catch(() => {});
    await Customer.destroy({ where: { phone: testPhone } }).catch(() => {});
    await PhoneVerification.destroy({ where: { phone: testPhone } }).catch(() => {});
    console.log('✓ Cleaned up temporary test data.');

    console.log('\n=======================================================');
    console.log('🎉 ALL VERIFICATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('=======================================================');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
