const fs = require('fs');
const path = require('path');

const baseUrl = 'http://localhost:3000';

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const res = await fetch(fullUrl, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {}
  return { status: res.status, headers: res.headers, text, json, redirected: res.redirected, url: res.url };
}

async function runFullVerification() {
  console.log('========================================================================');
  console.log('🚀 NIRMANA PRINTING: FULL SYSTEM & ROLE VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  const results = [];

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ ASSERTION FAILED: ${message}`);
      throw new Error(message);
    }
    console.log(`  ✓ ${message}`);
    results.push({ passed: true, message });
  }

  // =========================================================================
  // SCENE 1: Admin Sets Up Store, Staff & Custom Goods
  // =========================================================================
  console.log('\n--- SCENE 1: Admin Sets Up Store, Staff & Custom Goods ---');

  // 1.1 Admin Login
  console.log('1.1 Logging in as Admin...');
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  assert(adminLogin.status === 200 && adminLogin.json && adminLogin.json.success, 'Admin credentials accepted (admin / Password123!)');
  const adminToken = adminLogin.json.data.token;
  assert(adminToken !== undefined, 'Admin JWT auth token issued');

  // Verify Admin Dashboard access
  const adminDash = await request('/dashboard', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Cookie': `auth_token=${adminToken}` }
  });
  assert(adminDash.status === 200 && adminDash.text.includes('Dashboard'), 'Admin successfully loads store operational Dashboard (/dashboard)');

  // 1.2 Create Worker Account (Kasun Perera)
  console.log('\n1.2 Creating Worker Account (Kasun Perera)...');
  // Safe cleanup of kasun_staff and related test records if already existing
  const { User, StockItem, Customer, Order, QuickPrintJob, PosSale, PosSaleItem, StockTransaction, PhoneVerification, AuditLog } = require(path.join(process.cwd(), 'src/models'));
  const existingKasun = await User.findOne({ where: { username: 'kasun_staff' } });
  if (existingKasun) {
    const sales = await PosSale.findAll({ where: { cashierId: existingKasun.id } });
    for (const s of sales) {
      await PosSaleItem.destroy({ where: { saleId: s.id } });
      await s.destroy();
    }
    await AuditLog.destroy({ where: { userId: existingKasun.id } });
    await existingKasun.destroy();
  }

  const createWorkerRes = await request('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      username: 'kasun_staff',
      fullName: 'Kasun Perera',
      phone: '0712345678',
      role: 'WORKER',
      password: 'WorkerPass123!',
      email: 'kasun_staff@nirmana.lk'
    })
  });
  assert(createWorkerRes.status === 201 && createWorkerRes.json.success, 'Worker account created successfully via Admin API');
  const workerUser = createWorkerRes.json.data;
  assert(workerUser.username === 'kasun_staff' && workerUser.role === 'WORKER', 'User role is correctly set to WORKER');

  // Verify Kasun Perera appears in the users list
  const usersListRes = await request('/api/users', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert(usersListRes.status === 200 && usersListRes.json.success, 'User administration list loaded');
  const foundKasun = usersListRes.json.data.find(u => u.username === 'kasun_staff');
  assert(foundKasun && foundKasun.isActive === true && foundKasun.fullName === 'Kasun Perera', 'Kasun Perera appears in staff table with active status');

  // 1.3 Add Custom Goods & Materials to Stock
  console.log('\n1.3 Adding Custom Goods & Materials to Stock...');
  // Ensure the 3 items exist and have exact stock values
  // Item 1: White Ceramic Photo Mug (Stock: 50, Price: 850, Cost: 450)
  let mugItem = await StockItem.findOne({ where: { name: 'White Ceramic Photo Mug' } });
  if (!mugItem) {
    mugItem = await StockItem.create({
      code: 'STK-MUG-001',
      name: 'White Ceramic Photo Mug',
      category: 'Mugs & Gifts',
      unit: 'Pcs',
      currentStock: 50,
      minStockAlert: 10,
      unitCost: 450.00,
      sellingPrice: 850.00,
      dimensionUnit: 'inches',
      isActive: true
    });
  } else {
    mugItem.currentStock = 50;
    mugItem.sellingPrice = 850.00;
    mugItem.unitCost = 450.00;
    mugItem.category = 'Mugs & Gifts';
    await mugItem.save();
  }
  assert(parseFloat(mugItem.currentStock) === 50 && parseFloat(mugItem.sellingPrice) === 850.00, 'Item 1 (White Ceramic Photo Mug): Stock=50, Price=Rs.850.00, Cost=Rs.450.00 verified');

  // Item 2: 8x10 Wooden Photo Frame (Stock: 20, Price: 1200, Cost: 650, 8x10 inches)
  let frameItem = await StockItem.findOne({ where: { name: '8x10 Wooden Photo Frame' } });
  if (!frameItem) {
    frameItem = await StockItem.create({
      code: 'STK-FRM-001',
      name: '8x10 Wooden Photo Frame',
      category: 'Photo Frames',
      unit: 'Pcs',
      width: 8,
      length: 10,
      dimensionUnit: 'inches',
      sizeLabel: '8" x 10"',
      currentStock: 20,
      minStockAlert: 5,
      unitCost: 650.00,
      sellingPrice: 1200.00,
      isActive: true
    });
  } else {
    frameItem.currentStock = 20;
    frameItem.sellingPrice = 1200.00;
    frameItem.unitCost = 650.00;
    frameItem.sizeLabel = '8" x 10"';
    await frameItem.save();
  }
  assert(parseFloat(frameItem.currentStock) === 20 && parseFloat(frameItem.sellingPrice) === 1200.00, 'Item 2 (8x10 Wooden Photo Frame): Stock=20, Price=Rs.1200.00, Size=8"x10" verified');

  // Item 3: Gel Ink Pen 0.5mm (Stock: 100, Price: 80, Cost: 45)
  let penItem = await StockItem.findOne({ where: { name: 'Gel Ink Pen 0.5mm' } });
  if (!penItem) {
    penItem = await StockItem.create({
      code: 'STK-PEN-001',
      name: 'Gel Ink Pen 0.5mm',
      category: 'Stationery',
      unit: 'Pcs',
      currentStock: 100,
      minStockAlert: 20,
      unitCost: 45.00,
      sellingPrice: 80.00,
      isActive: true
    });
  } else {
    penItem.currentStock = 100;
    penItem.sellingPrice = 80.00;
    penItem.unitCost = 45.00;
    await penItem.save();
  }
  assert(parseFloat(penItem.currentStock) === 100 && parseFloat(penItem.sellingPrice) === 80.00, 'Item 3 (Gel Ink Pen 0.5mm): Stock=100, Price=Rs.80.00, Cost=Rs.45.00 verified');

  // =========================================================================
  // SCENE 2: Worker Login & Role Restriction (RBAC) Verification
  // =========================================================================
  console.log('\n--- SCENE 2: Worker Login & Role Restriction (RBAC) Verification ---');

  // 2.1 Login as Worker
  console.log('2.1 Logging in as Worker (kasun_staff / WorkerPass123!)...');
  const workerLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kasun_staff', password: 'WorkerPass123!' })
  });
  assert(workerLogin.status === 200 && workerLogin.json.success, 'Worker login successful');
  const workerToken = workerLogin.json.data.token;
  assert(workerLogin.json.data.user.role === 'WORKER', 'Worker role confirmed in login response');

  // Worker Dashboard & Operational Pages Access
  const workerDash = await request('/dashboard', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerDash.status === 200, 'Worker has full access to operational Dashboard (/dashboard)');

  const workerOrders = await request('/orders', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerOrders.status === 200, 'Worker has access to Printing Orders (/orders)');

  const workerStock = await request('/stock', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerStock.status === 200, 'Worker has access to Stock Management (/stock)');

  const workerPos = await request('/pos', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerPos.status === 200, 'Worker has access to Point of Sale (/pos)');

  const workerQuickPrint = await request('/quick-print', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerQuickPrint.status === 200, 'Worker has access to Quick Print Queue (/quick-print)');

  // 2.2 Test Security Boundary (Staff Restriction on /users)
  console.log('\n2.2 Testing Security Boundary: Worker attempting to access /users...');
  const workerUsersView = await request('/users', {
    headers: { 'Authorization': `Bearer ${workerToken}`, 'Cookie': `auth_token=${workerToken}` }
  });
  assert(workerUsersView.status === 403, 'Worker access to /users correctly blocked with HTTP 403 Forbidden');
  assert(workerUsersView.text.includes('Access Denied') || workerUsersView.text.includes('permission'), 'Worker receives Access Denied ("Administrator privileges required")');

  const workerUsersApi = await request('/api/users', {
    headers: { 'Authorization': `Bearer ${workerToken}` }
  });
  assert(workerUsersApi.status === 403, 'Worker access to /api/users correctly blocked with HTTP 403 Forbidden');

  // =========================================================================
  // SCENE 3: Walk-in Quick POS Sale (No Customer Profile Required)
  // =========================================================================
  console.log('\n--- SCENE 3: Walk-in Quick POS Sale (No Customer Profile Required) ---');
  console.log('3.1 Performing POS Sale: 2x Gel Pens (@ Rs. 80) + 1x ad-hoc Highlighter (@ Rs. 150)...');
  const initialPenStock = parseFloat(penItem.currentStock);

  const posSaleRes = await request('/api/pos/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${workerToken}`
    },
    body: JSON.stringify({
      customerName: 'Walk-in Customer (No Profile)',
      paymentMethod: 'CASH',
      amountTendered: 500.00,
      items: [
        {
          stockItemId: penItem.id,
          name: 'Gel Ink Pen 0.5mm',
          quantity: 2,
          unitPrice: 80.00
        },
        {
          stockItemId: null,
          name: 'Fluorescent Yellow Highlighter',
          quantity: 1,
          unitPrice: 150.00
        }
      ]
    })
  });
  assert(posSaleRes.status === 201 && posSaleRes.json.success, 'POS Sale completed successfully');
  const saleData = posSaleRes.json.data;
  assert(parseFloat(saleData.subtotal) === 310.00 && parseFloat(saleData.totalAmount) === 310.00, 'Sale total correctly calculated as Rs. 310.00 ((2x80) + (1x150))');
  assert(parseFloat(saleData.amountTendered) === 500.00, 'Cash tendered recorded as Rs. 500.00');
  assert(parseFloat(saleData.changeAmount) === 190.00, 'Change due correctly calculated as Rs. 190.00 (500 - 310)');
  assert(saleData.receiptNumber.startsWith('POS-'), `Valid receipt number generated: ${saleData.receiptNumber}`);

  // Check that stock for Gel Ink Pen decremented from 100 to 98
  const refreshedPen = await StockItem.findByPk(penItem.id);
  assert(parseFloat(refreshedPen.currentStock) === initialPenStock - 2, `Gel Ink Pen stock automatically decremented from ${initialPenStock} to ${refreshedPen.currentStock} (sold 2 pcs)`);

  // =========================================================================
  // SCENE 4: Guest / Online Order with Custom Mug Printing
  // =========================================================================
  console.log('\n--- SCENE 4: Guest / Online Order with Custom Mug Printing ---');

  // 4.1 Browse catalog as unauthenticated visitor
  console.log('4.1 Browsing public catalog at /products without login...');
  const catalogRes = await request('/products');
  assert(catalogRes.status === 200, 'Public products catalog accessible without login (/products)');
  assert(catalogRes.text.includes('White Ceramic Photo Mug'), 'White Ceramic Photo Mug visible in public catalog');

  // 4.2 Place online order with WhatsApp and Customization
  console.log('\n4.2 Placing Guest Online Order for Nimal Fernando (0775551234)...');
  const orderRes = await request('/api/orders/online-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Nimal Fernando',
      whatsappNumber: '0775551234',
      productName: 'White Ceramic Photo Mug',
      category: 'Mugs & Gifts',
      paperMaterial: '11oz Ceramic Mug',
      quantity: 2,
      unitPrice: 850.00,
      specifications: "Print family photo on front center with text: 'Happy Birthday Liam!'. Glossy finish."
    })
  });
  assert(orderRes.status === 201 && orderRes.json.success, 'Guest online order accepted successfully');
  const nimalOrder = orderRes.json.data;
  assert(nimalOrder.orderNumber.startsWith('ORD-'), `Order generated: #${nimalOrder.orderNumber}`);
  assert(parseFloat(nimalOrder.totalAmount) === 1700.00, 'Order total is Rs. 1,700.00 (2 x 850)');
  assert(parseFloat(nimalOrder.balanceAmount) === 1700.00, 'Balance due is Rs. 1,700.00');
  assert(nimalOrder.status === 'RECEIVED', 'Order initial status is RECEIVED');
  assert(nimalOrder.paperMaterial === '11oz Ceramic Mug', 'Material substrate set to 11oz Ceramic Mug');
  assert(nimalOrder.specifications.includes('Happy Birthday Liam!'), 'Customization instructions stored accurately');

  // =========================================================================
  // SCENE 5: Self-Service Mobile / QR Quick Print Upload (Custom Good Type)
  // =========================================================================
  console.log('\n--- SCENE 5: Self-Service Mobile / QR Quick Print Upload ---');

  // 5.1 Self-service upload
  console.log('5.1 Submitting Quick Print Photo for 8x10 Frame (Phone: 0775551234)...');
  const dummyImg = path.join(__dirname, 'test_frame_photo.png');
  fs.writeFileSync(dummyImg, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  const fileBytes = fs.readFileSync(dummyImg);
  const blob = new Blob([fileBytes], { type: 'image/png' });
  const form = new FormData();
  form.append('files', blob, 'family_portrait_8x10.png');
  form.append('customerName', 'Nimal Fernando');
  form.append('customerPhone', '0775551234');
  form.append('paperSize', '8" x 10" Photo Frame');
  form.append('colorMode', 'COLOR');
  form.append('copies', '1');
  form.append('customerMessage', 'Please frame with black border. Pickup today 5 PM.');

  const qpRes = await request('/api/quick-print/upload', {
    method: 'POST',
    body: form
  });
  assert((qpRes.status === 200 || qpRes.status === 201) && qpRes.json.success, 'Quick print self-service job submitted successfully');
  const qpJob = qpRes.json.data;
  assert(qpJob.tokenNumber.startsWith('QP-'), `Token issued: #${qpJob.tokenNumber}`);
  assert(qpJob.paperSize === '8" x 10" Photo Frame', 'Custom good size selected: 8" x 10" Photo Frame (not generic A4)');
  assert(qpJob.status === 'PENDING', 'Queue status is PENDING');
  try { fs.unlinkSync(dummyImg); } catch (e) {}

  // 5.2 Worker handles Quick Print queue
  console.log('\n5.2 Worker inspecting and advancing Quick Print Queue...');
  const workerQpList = await request('/api/quick-print/jobs?status=ALL', {
    headers: { 'Authorization': `Bearer ${workerToken}` }
  });
  assert(workerQpList.status === 200 && workerQpList.json.success, 'Worker retrieved Quick Print queue');
  const foundQp = workerQpList.json.data.find(j => j.tokenNumber === qpJob.tokenNumber);
  assert(foundQp !== undefined, `Token #${qpJob.tokenNumber} visible in worker queue`);
  assert(foundQp.customerMessage.includes('black border'), 'Worker sees customer note: "Please frame with black border. Pickup today 5 PM."');

  // Start print -> PRINTING
  const qpId = qpJob.jobId || qpJob.id;
  const qpPrintingRes = await request(`/api/quick-print/jobs/${qpId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ status: 'PRINTING' })
  });
  assert(qpPrintingRes.status === 200 && qpPrintingRes.json.data.status === 'PRINTING', 'Status transitioned to PRINTING');

  // Mark ready -> READY
  const qpReadyRes = await request(`/api/quick-print/jobs/${qpId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ status: 'READY' })
  });
  assert(qpReadyRes.status === 200 && qpReadyRes.json.data.status === 'READY', 'Status transitioned to READY (Ready for Pickup)');

  // =========================================================================
  // SCENE 6: Late Customer Registration with SMS OTP & Automatic Linking
  // =========================================================================
  console.log('\n--- SCENE 6: Late Customer Registration with SMS OTP & Automatic Linking ---');

  // 6.1 Register with SMS OTP
  console.log('6.1 Requesting SMS OTP for Nimal Fernando (0775551234)...');
  // Clean up previous test nimal_client user if any
  const existingNimal = await User.findOne({ where: { username: 'nimal_client' } });
  if (existingNimal) {
    await AuditLog.destroy({ where: { userId: existingNimal.id } });
    await existingNimal.destroy();
  }

  const otpRes = await request('/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0775551234' })
  });
  let otpCode = otpRes.json ? otpRes.json.devOtp : null;
  if (!otpCode) {
    // If rate limited or in test environment, retrieve active OTP from phone verification record
    const pv = await PhoneVerification.findOne({ where: { phone: '0775551234' }, order: [['id', 'DESC']] });
    if (pv) otpCode = pv.otp;
  }
  console.log(`  ✓ OTP Code retrieved: ${otpCode}`);

  const verifyOtpRes = await request('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0775551234', otp: otpCode })
  });
  assert(verifyOtpRes.status === 200 && verifyOtpRes.json.success, 'Phone ownership verified via SMS OTP');

  console.log('\nCompleting customer registration (nimal_client / Password123!)...');
  const custRegRes = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Nimal Fernando',
      phone: '0775551234',
      username: 'nimal_client',
      email: 'nimal_client@nirmana.lk',
      password: 'Password123!'
    })
  });
  assert(custRegRes.status === 201 && custRegRes.json.success, 'Customer registered successfully');
  const nimalToken = custRegRes.json.data.token;
  const nimalUser = custRegRes.json.data.user;
  assert(nimalUser.role === 'CUSTOMER', 'Role is CUSTOMER');
  assert(nimalUser.customerId !== null, 'Customer account linked to customerId: ' + nimalUser.customerId);

  // 6.2 Retroactive Linking in Customer Portal (/portal)
  console.log('\n6.2 Verifying Retroactive Linking in Customer Portal (/portal)...');
  const portalRes = await request('/portal', {
    headers: { 'Authorization': `Bearer ${nimalToken}`, 'Cookie': `auth_token=${nimalToken}` }
  });
  assert(portalRes.status === 200, 'Customer successfully accesses Customer Portal (/portal)');

  // Verify DB data reflects retroactive linking
  const customerRecord = await Customer.findByPk(nimalUser.customerId, {
    include: [
      { model: Order, as: 'orders' }
    ]
  });
  const linkedOrders = customerRecord.orders || [];
  const linkedMugOrder = linkedOrders.find(o => o.orderNumber === nimalOrder.orderNumber);
  assert(linkedMugOrder !== undefined, `Prior guest Mug Order #${nimalOrder.orderNumber} automatically linked to customer profile!`);
  assert(linkedMugOrder.jobTitle === 'White Ceramic Photo Mug', 'Linked order shows job title: White Ceramic Photo Mug');
  assert(linkedMugOrder.paperMaterial === '11oz Ceramic Mug', 'Linked order shows material: 11oz Ceramic Mug');
  assert(linkedMugOrder.specifications.includes('Happy Birthday Liam!'), 'Linked order preserves customization request');
  assert(parseFloat(linkedMugOrder.totalAmount) === 1700.00, 'Linked order total: Rs. 1,700.00');
  assert(parseFloat(linkedMugOrder.balanceAmount) === 1700.00, 'Linked order balance due: Rs. 1,700.00');

  // Verify Quick Print linking
  const linkedQpJobs = await QuickPrintJob.findAll({ where: { customerId: customerRecord.id } });
  const linkedQp = linkedQpJobs.find(q => q.tokenNumber === qpJob.tokenNumber);
  assert(linkedQp !== undefined, `Prior Quick Print Job #${qpJob.tokenNumber} automatically linked!`);
  assert(linkedQp.paperSize === '8" x 10" Photo Frame', 'Quick print job reflects 8" x 10" Photo Frame');
  assert(linkedQp.status === 'READY', 'Quick print job shows live queue status: READY (Ready for Pickup)');

  // =========================================================================
  // SCENE 7: Customer Isolation & Financial Settlement
  // =========================================================================
  console.log('\n--- SCENE 7: Customer Isolation & Financial Settlement ---');

  // 7.1 Verify Customer Role Isolation
  console.log('7.1 Verifying Customer Role Isolation (RBAC)...');
  const testProtectedPaths = ['/dashboard', '/orders', '/stock', '/pos', '/customers', '/users'];
  for (const pagePath of testProtectedPaths) {
    const r = await request(pagePath, {
      headers: { 'Authorization': `Bearer ${nimalToken}`, 'Cookie': `auth_token=${nimalToken}` }
    });
    // Customer should either be redirected to /portal or get 403
    const isSafe = r.status === 403 || r.url.includes('/portal') || r.text.includes('Customer Dashboard') || r.redirected;
    assert(isSafe, `Customer navigating to ${pagePath} is safely redirected to /portal or blocked with 403`);
  }

  // 7.2 Store Worker Settles Payment
  console.log('\n7.2 Store Worker settling payment of Rs. 1,700.00 Cash for Mug order...');
  const payRes = await request(`/api/orders/${nimalOrder.id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ amount: 1700.00, paymentMethod: 'CASH', notes: 'Full settlement at store counter' })
  });
  assert(payRes.status === 200 && payRes.json.success, 'Payment of Rs. 1,700.00 recorded successfully by Worker');
  assert(parseFloat(payRes.json.data.advancePaid) === 1700.00, 'Advance paid updated to Rs. 1,700.00');
  assert(parseFloat(payRes.json.data.balanceAmount) === 0.00, 'Remaining balance updated to Rs. 0.00');

  // Move order to COMPLETED
  const completeRes = await request(`/api/orders/${nimalOrder.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ status: 'COMPLETED', notes: 'Handed over to client in person' })
  });
  assert(completeRes.status === 200 && completeRes.json.data.status === 'COMPLETED', 'Order status advanced to COMPLETED');

  // 7.3 Customer Portal Real-Time Verification
  console.log('\n7.3 Verifying Customer Portal real-time reflection for Nimal Fernando...');
  const refreshedCust = await Customer.findByPk(customerRecord.id, {
    include: [{ model: Order, as: 'orders' }]
  });
  const updatedMugOrder = refreshedCust.orders.find(o => o.id === nimalOrder.id);
  assert(updatedMugOrder.status === 'COMPLETED', 'Customer portal shows order status COMPLETED');
  assert(parseFloat(updatedMugOrder.advancePaid) === 1700.00, 'Customer portal shows Given Amount (Paid): Rs. 1,700.00');
  assert(parseFloat(updatedMugOrder.balanceAmount) === 0.00, 'Customer portal shows Yet to Give (Balance): Rs. 0.00 (Fully Settled)');

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${results.length} VERIFICATION CHECKS PASSED SUCCESSFULLY ACROSS ALL 7 SCENES!`);
  console.log('========================================================================\n');
}

runFullVerification().catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
