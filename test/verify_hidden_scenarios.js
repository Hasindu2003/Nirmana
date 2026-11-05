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

async function runHiddenScenariosVerification() {
  console.log('========================================================================');
  console.log('🔍 NIRMANA PRINTING: HIDDEN SCENARIOS & PERMISSION VERIFICATION');
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

  const { User, StockItem, Customer, Order, QuickPrintJob, PosSale, PosSaleItem, StockTransaction, PhoneVerification, AuditLog, Payment } = require(path.join(process.cwd(), 'src/models'));

  // 1. Get Tokens for Admin, Worker, Customer A, and Customer B
  console.log('1. Setting up role test users & tokens...');

  // Admin Token
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  assert(adminLogin.status === 200 && adminLogin.json.success, 'Admin authenticated');
  const adminToken = adminLogin.json.data.token;

  // Worker Token (kasun_staff)
  const workerLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kasun_staff', password: 'WorkerPass123!' })
  });
  assert(workerLogin.status === 200 && workerLogin.json.success, 'Worker (kasun_staff) authenticated');
  const workerToken = workerLogin.json.data.token;

  // Customer A (nimal_client - 0775551234)
  const custALogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nimal_client', password: 'Password123!' })
  });
  assert(custALogin.status === 200 && custALogin.json.success, 'Customer A (nimal_client) authenticated');
  const custAToken = custALogin.json.data.token;
  const custAUser = custALogin.json.data.user;

  // Customer B (test_client_b - 0771112233)
  let custBUser = await User.findOne({ where: { username: 'test_client_b' } });
  let custBToken = null;
  if (!custBUser) {
    const otpSendB = await request('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0771112233' })
    });
    let devOtpB = otpSendB.json ? otpSendB.json.devOtp : null;
    if (!devOtpB) {
      const pv = await PhoneVerification.findOne({ where: { phone: '0771112233' }, order: [['id', 'DESC']] });
      if (pv) devOtpB = pv.otp;
    }
    await request('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0771112233', otp: devOtpB })
    });

    const regB = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Kamal Perera',
        phone: '0771112233',
        username: 'test_client_b',
        email: 'kamal_b@nirmana.lk',
        password: 'Password123!'
      })
    });
    assert(regB.status === 201 && regB.json.success, 'Customer B (test_client_b) created');
    custBToken = regB.json.data.token;
    custBUser = regB.json.data.user;
  } else {
    const logB = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_client_b', password: 'Password123!' })
    });
    custBToken = logB.json.data.token;
  }
  assert(custBToken !== null, 'Customer B authenticated');

  // =========================================================================
  // HIDDEN SCENARIO 1: Customer Order Editing Before Print & Lock Enforcement
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 1: Customer Order Editing Before Print & Lock Enforcement ---');
  // Customer A places an order for 2 mugs
  const orderCreateRes = await request('/api/orders/online-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({
      customerName: 'Nimal Fernando',
      productName: 'Custom Photo Mug',
      paperMaterial: '11oz Ceramic Mug',
      quantity: 2,
      unitPrice: 850.00,
      specifications: 'Initial request: Blue inner, left handle'
    })
  });
  assert(orderCreateRes.status === 201 && orderCreateRes.json.success, 'Customer A placed new order');
  const orderA = orderCreateRes.json.data;
  assert(parseFloat(orderA.totalAmount) === 1700.00, 'Initial total is Rs. 1,700.00');

  // Customer A edits quantity from 2 to 4 and updates instructions while status is RECEIVED
  console.log('1.1 Customer A edits order while RECEIVED (increases quantity 2 -> 4)...');
  const editRes = await request(`/api/orders/${orderA.id}/customer-edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({
      quantity: 4,
      specifications: 'Updated: White inner, couple photo on both sides'
    })
  });
  assert(editRes.status === 200 && editRes.json.success, 'Order successfully edited by customer before print');
  assert(editRes.json.data.quantity === 4, 'Quantity updated to 4');
  assert(parseFloat(editRes.json.data.totalAmount) === 3400.00, 'Total automatically recalculated to Rs. 3,400.00 (4 x 850)');
  assert(parseFloat(editRes.json.data.balanceAmount) === 3400.00, 'Balance automatically updated to Rs. 3,400.00');

  // Worker moves order to PRINTING
  console.log('1.2 Worker moves order to PRINTING...');
  const printingRes = await request(`/api/orders/${orderA.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ status: 'PRINTING', notes: 'Machine prepped and running' })
  });
  assert(printingRes.status === 200 && printingRes.json.data.status === 'PRINTING', 'Order status set to PRINTING');

  // Customer A attempts to edit again during PRINTING
  console.log('1.3 Customer A attempts to edit again during PRINTING (must be rejected)...');
  const blockedEditRes = await request(`/api/orders/${orderA.id}/customer-edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({ quantity: 5, specifications: 'Change during print' })
  });
  assert(blockedEditRes.status === 400 && !blockedEditRes.json.success, 'Edit attempt during PRINTING correctly rejected with 400');
  assert(blockedEditRes.json.message.includes('locked') || blockedEditRes.json.message.includes('PRINTING'), 'Rejection message explains editing is locked once production starts');

  // =========================================================================
  // HIDDEN SCENARIO 2: Bank Transfer Slip Upload & Staff Approval Workflow
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 2: Bank Transfer Slip Upload & Staff Approval Workflow ---');
  // Customer A uploads bank transfer slip
  console.log('2.1 Customer A uploads bank slip (Rs. 3,400 via Commercial Bank Flash)...');
  const dummySlip = path.join(__dirname, 'test_combank_slip.png');
  fs.writeFileSync(dummySlip, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  const fileBytes = fs.readFileSync(dummySlip);
  const blob = new Blob([fileBytes], { type: 'image/png' });
  const form = new FormData();
  form.append('slipFile', blob, 'combank_flash_receipt.png');
  form.append('amount', '3400.00');
  form.append('refNumber', 'CBF-998822');
  form.append('notes', 'Paid from account ending 4412');

  const slipUploadRes = await request(`/api/orders/${orderA.id}/payment-slip`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${custAToken}` },
    body: form
  });
  assert(slipUploadRes.status === 200 && slipUploadRes.json.success, 'Bank slip uploaded by customer');
  assert(slipUploadRes.json.data.paymentSlipStatus === 'PENDING_VERIFICATION', 'Slip status is PENDING_VERIFICATION');
  assert(parseFloat(slipUploadRes.json.data.paymentSlipAmount) === 3400.00, 'Claimed slip amount is Rs. 3,400.00');
  try { fs.unlinkSync(dummySlip); } catch (e) {}

  // Worker verifies the slip inside Order Details
  console.log('2.2 Worker verifies slip & credits payment (action: VERIFY)...');
  const verifyRes = await request(`/api/orders/${orderA.id}/verify-slip`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({
      action: 'VERIFY',
      verifiedAmount: 3400.00,
      notes: 'Statement check confirmed reference CBF-998822'
    })
  });
  assert(verifyRes.status === 200 && verifyRes.json.success, 'Bank slip verified and payment credited by Worker');
  assert(verifyRes.json.data.paymentSlipStatus === 'VERIFIED', 'Slip status transitioned to VERIFIED');
  assert(parseFloat(verifyRes.json.data.advancePaid) === 3400.00, 'Advance paid credited with Rs. 3,400.00');
  assert(parseFloat(verifyRes.json.data.balanceAmount) === 0.00, 'Balance due successfully reduced to Rs. 0.00');

  // Verify that a Payment record was created in the database
  const createdPayment = await Payment.findOne({ where: { orderId: orderA.id, paymentMethod: 'BANK_TRANSFER' } });
  assert(createdPayment !== null && parseFloat(createdPayment.amount) === 3400.00, 'Formal Payment row created with method BANK_TRANSFER and amount Rs. 3,400.00');

  // =========================================================================
  // HIDDEN SCENARIO 3: Bank Transfer Slip Rejection & Re-upload Request
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 3: Bank Transfer Slip Rejection & Re-upload Request ---');
  // Customer B places an order for Photo Frame (Rs. 1,200)
  const orderBRes = await request('/api/orders/online-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custBToken}` },
    body: JSON.stringify({
      customerName: 'Kamal Perera',
      productName: '8x10 Wooden Photo Frame',
      paperMaterial: '8x10 Wood Frame',
      quantity: 1,
      unitPrice: 1200.00
    })
  });
  assert(orderBRes.status === 201 && orderBRes.json.success, 'Customer B placed order');
  const orderB = orderBRes.json.data;

  // Customer B uploads an invalid/blurry slip
  const dummySlipB = path.join(__dirname, 'blurry_slip.png');
  fs.writeFileSync(dummySlipB, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const blobB = new Blob([fs.readFileSync(dummySlipB)], { type: 'image/png' });
  const formB = new FormData();
  formB.append('slipFile', blobB, 'blurry_slip.png');
  formB.append('amount', '1200.00');
  formB.append('refNumber', 'UNKNOWN-123');

  await request(`/api/orders/${orderB.id}/payment-slip`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${custBToken}` },
    body: formB
  });
  try { fs.unlinkSync(dummySlipB); } catch (e) {}

  // Worker rejects the slip with reason
  console.log('3.1 Worker rejects illegible slip with feedback...');
  const rejectRes = await request(`/api/orders/${orderB.id}/verify-slip`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({
      action: 'REJECT',
      notes: 'Screenshot illegible. Transaction not found in shop BOC statement.'
    })
  });
  assert(rejectRes.status === 200 && rejectRes.json.success, 'Worker successfully rejected slip');
  assert(rejectRes.json.data.paymentSlipStatus === 'REJECTED', 'Order slip status is now REJECTED');
  assert(parseFloat(rejectRes.json.data.balanceAmount) === 1200.00, 'Balance due remains Rs. 1,200.00 (not credited)');

  // Verify Customer B sees the rejection in their portal
  const custBPortal = await request('/portal', {
    headers: { 'Authorization': `Bearer ${custBToken}`, 'Cookie': `auth_token=${custBToken}` }
  });
  assert(custBPortal.status === 200, 'Customer B can view portal');
  assert(custBPortal.text.includes('Slip Rejected') || custBPortal.text.includes('REJECTED'), 'Customer B portal displays rejection notification prompting re-upload');

  // =========================================================================
  // HIDDEN SCENARIO 4: Converting a Quick Print Token into a Formal Order
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 4: Converting a Quick Print Token into a Formal Order ---');
  // Guest uploads quick print job
  const dummyDoc = path.join(__dirname, 'project_report.png');
  fs.writeFileSync(dummyDoc, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const blobDoc = new Blob([fs.readFileSync(dummyDoc)], { type: 'image/png' });
  const formDoc = new FormData();
  formDoc.append('files', blobDoc, 'project_report.png');
  formDoc.append('customerName', 'Saman Kumara');
  formDoc.append('customerPhone', '0772223344');
  formDoc.append('paperSize', 'A4');
  formDoc.append('colorMode', 'COLOR');
  formDoc.append('copies', '10');
  formDoc.append('customerMessage', 'Bind with spiral coil');

  const uploadDocRes = await request('/api/quick-print/upload', {
    method: 'POST',
    body: formDoc
  });
  assert((uploadDocRes.status === 200 || uploadDocRes.status === 201) && uploadDocRes.json.success, 'Quick print job created');
  const tokenJob = uploadDocRes.json.data;
  const qpId = tokenJob.jobId || tokenJob.id;
  try { fs.unlinkSync(dummyDoc); } catch (e) {}

  // Worker converts the token into a formal billing order
  console.log(`4.1 Worker converting token #${tokenJob.tokenNumber} to formal Order...`);
  const convertRes = await request(`/api/quick-print/jobs/${qpId}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({
      jobTitle: 'A4 Color Project Reports (Spiral Bound)',
      totalAmount: 1500.00,
      advancePaid: 500.00
    })
  });
  assert(convertRes.status === 200 && convertRes.json.success, 'Token successfully converted to formal Order');
  const convertedOrder = convertRes.json.data.order;
  assert(convertedOrder.orderNumber.startsWith('ORD-'), `Formal Order created: #${convertedOrder.orderNumber}`);
  assert(parseFloat(convertedOrder.totalAmount) === 1500.00, 'Order total is Rs. 1,500.00');
  assert(parseFloat(convertedOrder.advancePaid) === 500.00, 'Advance paid recorded as Rs. 500.00');
  assert(parseFloat(convertedOrder.balanceAmount) === 1000.00, 'Balance due is Rs. 1,000.00');
  assert(convertedOrder.specifications.includes('project_report.png') || convertedOrder.notes.includes('project_report'), 'Attached file references preserved in order specifications and notes');

  // =========================================================================
  // HIDDEN SCENARIO 5: Shop Internal Material Wastage & Office Use Tracking
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 5: Shop Internal Material Wastage & Office Use Tracking ---');
  const penStockItem = await StockItem.findOne({ where: { name: 'Gel Ink Pen 0.5mm' } });
  const stockBeforeOfficeUse = parseFloat(penStockItem.currentStock);

  // Record 2 pens for Office Use (e.g. front desk counter)
  console.log('5.1 Worker records 2 pens for Office Use...');
  const officeUseRes = await request('/api/stock/office-use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({
      stockItemId: penStockItem.id,
      quantity: 2,
      reference: 'Counter Admin Supplies',
      notes: 'Pens allocated for reception check-in desk'
    })
  });
  assert(officeUseRes.status === 200 && officeUseRes.json.success, 'Office use stock deduction recorded');
  const refreshedPenItem = await StockItem.findByPk(penStockItem.id);
  assert(parseFloat(refreshedPenItem.currentStock) === stockBeforeOfficeUse - 2, `Current stock decremented by 2 (from ${stockBeforeOfficeUse} to ${refreshedPenItem.currentStock})`);

  // Verify stock transaction logged
  const officeTx = await StockTransaction.findOne({
    where: { stockItemId: penStockItem.id, category: 'OFFICE_USE' },
    order: [['id', 'DESC']]
  });
  assert(officeTx !== null && officeTx.type === 'OUT' && officeTx.category === 'OFFICE_USE', 'StockTransaction logged with type OUT and category OFFICE_USE');

  // Customer attempts to record stock out (must be blocked)
  console.log('5.2 Customer attempts to record stock out (must be blocked)...');
  const blockedStockOut = await request('/api/stock/office-use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({ stockItemId: penStockItem.id, quantity: 10 })
  });
  assert(blockedStockOut.status === 403, 'Customer blocked from recording stock out with HTTP 403 Forbidden');

  // =========================================================================
  // HIDDEN SCENARIO 6: POS Sale Voiding / Return & Automatic Stock Restoral
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 6: POS Sale Voiding & Automatic Stock Restoral ---');
  // First make a sale of 5 pens
  const initialStockBeforeSale = parseFloat(refreshedPenItem.currentStock);
  const saleRes = await request('/api/pos/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({
      customerName: 'Mistaken Counter Customer',
      paymentMethod: 'CASH',
      amountTendered: 500.00,
      items: [{ stockItemId: penStockItem.id, name: 'Gel Ink Pen 0.5mm', quantity: 5, unitPrice: 80.00 }]
    })
  });
  assert(saleRes.status === 201 && saleRes.json.success, 'POS Sale created');
  const posSale = saleRes.json.data;
  const penAfterSale = await StockItem.findByPk(penStockItem.id);
  assert(parseFloat(penAfterSale.currentStock) === initialStockBeforeSale - 5, `Stock deducted by 5 (now ${penAfterSale.currentStock})`);

  // Worker voids the sale
  console.log(`6.1 Worker voids sale #${posSale.receiptNumber}...`);
  const voidRes = await request(`/api/pos/sales/${posSale.id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` }
  });
  assert(voidRes.status === 200 && voidRes.json.success, 'POS Sale successfully voided');
  assert(voidRes.json.data.status === 'VOIDED', 'Sale status is VOIDED');

  // Verify stock was restored
  const penAfterVoid = await StockItem.findByPk(penStockItem.id);
  assert(parseFloat(penAfterVoid.currentStock) === initialStockBeforeSale, `Stock automatically restored from ${penAfterSale.currentStock} back to ${penAfterVoid.currentStock}!`);

  // Customer attempts to void a sale
  console.log('6.2 Customer attempts to void POS sale (must be blocked)...');
  const custVoidAttempt = await request(`/api/pos/sales/${posSale.id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` }
  });
  assert(custVoidAttempt.status === 403, 'Customer blocked from voiding sales with HTTP 403 Forbidden');

  // =========================================================================
  // HIDDEN SCENARIO 7: Delivered on Credit, Manual Discount & Delayed Settlement
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 7: Delivered on Credit, Manual Discount & Delayed Settlement ---');
  // Order B (from Kamal Perera): subtotal was 1,200.00.
  // Worker applies a loyalty discount of Rs. 200.00
  console.log('7.1 Worker applies Rs. 200.00 manual discount to Order B...');
  const discountRes = await request(`/api/orders/${orderB.id}/discount`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ discount: 200.00 })
  });
  assert(discountRes.status === 200 && discountRes.json.success, 'Manual discount applied');
  assert(parseFloat(discountRes.json.data.totalAmount) === 1000.00, 'Order total reduced to Rs. 1,000.00');
  assert(parseFloat(discountRes.json.data.balanceAmount) === 1000.00, 'Balance due updated to Rs. 1,000.00');

  // Worker completes and delivers order on credit (Customer will pay next week)
  console.log('7.2 Worker completes and delivers order on credit (balance still due)...');
  const creditDeliveryRes = await request(`/api/orders/${orderB.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ status: 'COMPLETED', notes: 'Delivered to client on credit' })
  });
  assert(creditDeliveryRes.status === 200 && creditDeliveryRes.json.data.status === 'COMPLETED', 'Order status marked COMPLETED');
  assert(parseFloat(creditDeliveryRes.json.data.balanceAmount) === 1000.00, 'Order delivered with remaining balance of Rs. 1,000.00');

  // Client Kamal comes back days later and pays remaining Rs. 1,000.00
  console.log('7.3 Client pays remaining balance of Rs. 1,000.00 Cash...');
  const settleRes = await request(`/api/orders/${orderB.id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
    body: JSON.stringify({ amount: 1000.00, paymentMethod: 'CASH', notes: 'Settled credit balance' })
  });
  assert(settleRes.status === 200 && settleRes.json.success, 'Credit balance payment recorded');
  assert(parseFloat(settleRes.json.data.advancePaid) === 1000.00, 'Given amount is now Rs. 1,000.00');
  assert(parseFloat(settleRes.json.data.balanceAmount) === 0.00, 'Balance due is now Rs. 0.00 (Fully Settled)');

  // =========================================================================
  // HIDDEN SCENARIO 8: Public Guest Tracking & Cross-Customer Data Isolation
  // =========================================================================
  console.log('\n--- HIDDEN SCENARIO 8: Public Guest Tracking & Cross-Customer Data Isolation ---');
  // 8.1 Public Tracking
  console.log(`8.1 Public Guest tracking order #${convertedOrder.orderNumber}...`);
  const trackOrderRes = await request(`/api/orders/track/${convertedOrder.orderNumber}`);
  assert(trackOrderRes.status === 200 && trackOrderRes.json.success, 'Public tracking returned order info');
  assert(trackOrderRes.json.data.orderNumber === convertedOrder.orderNumber, 'Correct order number resolved');
  assert(trackOrderRes.json.data.unitCost === undefined, 'Confidential supplier unitCost is NOT exposed to public');

  // 8.2 Cross-Customer Tampering Prevention (Customer A cannot edit Customer B's order)
  console.log(`8.2 Customer A attempting to edit Customer B's order #${orderB.orderNumber} (must be blocked)...`);
  const tamperRes = await request(`/api/orders/${orderB.id}/customer-edit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({ specifications: 'Hacked specifications' })
  });
  assert(tamperRes.status === 400 && !tamperRes.json.success, 'Tampering attempt blocked with 400 Access Denied');
  assert(tamperRes.json.message.includes('only edit your own orders'), 'Error message confirms: "You can only edit your own orders"');

  // 8.3 Cross-Customer Slip Tampering Prevention
  console.log(`8.3 Customer A attempting to upload slip to Customer B's order (must be blocked)...`);
  const dummySlipTamper = path.join(__dirname, 'tamper_slip.png');
  fs.writeFileSync(dummySlipTamper, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const formTamper = new FormData();
  formTamper.append('slipFile', new Blob([fs.readFileSync(dummySlipTamper)], { type: 'image/png' }), 'tamper.png');
  formTamper.append('amount', '500');

  const slipTamperRes = await request(`/api/orders/${orderB.id}/payment-slip`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${custAToken}` },
    body: formTamper
  });
  assert(slipTamperRes.status === 400 && !slipTamperRes.json.success, 'Slip tampering attempt blocked with 400 Access Denied');
  assert(slipTamperRes.json.message.includes('only upload slips to your own orders'), 'Error confirms: "You can only upload slips to your own orders"');
  try { fs.unlinkSync(dummySlipTamper); } catch (e) {}

  // 8.4 Customer attempting to verify / approve a slip (Privilege Escalation attempt)
  console.log(`8.4 Customer A attempting to verify/approve a payment slip (must be blocked with 403)...`);
  const customerVerifyAttempt = await request(`/api/orders/${orderA.id}/verify-slip`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custAToken}` },
    body: JSON.stringify({ action: 'VERIFY', verifiedAmount: 1000 })
  });
  assert(customerVerifyAttempt.status === 403, 'Customer privilege escalation to approve slips strictly blocked with HTTP 403 Forbidden');

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${results.length} HIDDEN SCENARIO & PERMISSION CHECKS PASSED SUCCESSFULLY!`);
  console.log('========================================================================\n');
}

runHiddenScenariosVerification().catch(err => {
  console.error('\n❌ HIDDEN SCENARIO TEST FAILED:', err);
  process.exit(1);
});
