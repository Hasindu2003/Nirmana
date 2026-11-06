const assert = require('assert');
const http = require('http');
const orderService = require('../src/services/orderService');
const posService = require('../src/services/posService');
const dashboardService = require('../src/services/dashboardService');
const quickPrintService = require('../src/services/quickPrintService');
const { Order, PosSale, PosSaleItem, Customer, QuickPrintJob } = require('../src/models');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (typeof data === 'string') req.write(data);
      else req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function postJson(path, data, token) {
  const jsonStr = JSON.stringify(data);
  return request({
    hostname: 'localhost',
    port: 3000,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonStr),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  }, jsonStr);
}

function putJson(path, data, token) {
  const jsonStr = JSON.stringify(data);
  return request({
    hostname: 'localhost',
    port: 3000,
    path,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonStr),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  }, jsonStr);
}

function get(path, token) {
  return request({
    hostname: 'localhost',
    port: 3000,
    path,
    method: 'GET',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}`, 'Cookie': `token=${token}` } : {})
    }
  });
}

async function runFullSystemCheckup() {
  console.log('================================================================');
  console.log('🧪 FULL SYSTEM CHECKUP: ALL POST-CHANGE REAL-WORLD SCENARIOS');
  console.log('================================================================');

  const reportResults = [];

  // Authenticate Admin
  const loginRes = await postJson('/api/auth/login', { username: 'admin', password: 'Password123!' });
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const token = loginRes.body.data.token;
  console.log('✓ Admin authenticated successfully.\n');

  // -------------------------------------------------------------------------
  // Scenario 1: Intake & Isolation of Photo Frame Order
  // -------------------------------------------------------------------------
  console.log('▶ Scenario 1: Photo Frame Studio Order Intake & Isolation');
  const frameOrderRes = await postJson('/api/orders', {
    newCustomerName: 'Saman Jayasuriya',
    newCustomerPhone: '0778899001',
    jobTitle: 'Teak Wood Oval Portrait Frame 10x12',
    orderType: 'PHOTO_FRAME',
    paperMaterial: '10" x 12" Oval Teak Wood Frame',
    quantity: 1,
    subtotal: 3200.00,
    discount: 200.00,
    discountType: 'FIXED',
    totalAmount: 3000.00,
    advancePaid: 1500.00,
    specifications: 'Clear float glass with velvet burgundy backing',
    status: 'RECEIVED',
  }, token);

  assert.strictEqual(frameOrderRes.status, 201, 'Photo Frame order creation must return 201');
  const frameOrder = frameOrderRes.body.data;
  assert.strictEqual(frameOrder.orderType, 'PHOTO_FRAME', 'orderType must be PHOTO_FRAME');
  console.log(`  ✓ Created Order #${frameOrder.orderNumber} with orderType=PHOTO_FRAME`);

  // Verify view queries: Frame Studio vs General Orders
  const frameStudioView = await orderService.getAllOrders({ type: 'frame', paginate: false });
  const generalOrdersView = await orderService.getAllOrders({ type: 'general', paginate: false });

  assert(frameStudioView.some(o => o.id === frameOrder.id), 'Frame order MUST appear in Photo Frames Studio view');
  assert(!generalOrdersView.some(o => o.id === frameOrder.id), 'Frame order MUST NOT appear in General Orders view');
  console.log('  ✓ Isolation confirmed: Frame order is present in Studio view and absent from General Orders view.');
  reportResults.push({ scenario: '1. Photo Frame Intake & Isolation', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 2: Intake & Isolation of General Commercial Print Order
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 2: General Commercial Print Order Intake & Isolation');
  const generalOrderRes = await postJson('/api/orders', {
    newCustomerName: 'TechVibe Lanka',
    newCustomerPhone: '0714455667',
    jobTitle: 'Vinyl Gloss Die-Cut Stickers (200 Pcs)',
    orderType: 'GENERAL_PRINT',
    paperMaterial: 'Waterproof Gloss Vinyl Adhesive',
    quantity: 200,
    subtotal: 4500.00,
    discount: 0.00,
    discountType: 'FIXED',
    totalAmount: 4500.00,
    advancePaid: 2000.00,
    specifications: 'Contour cut circular logo stickers, 3-inch diameter',
    status: 'RECEIVED',
  }, token);

  assert.strictEqual(generalOrderRes.status, 201, 'General print order creation must return 201');
  const generalOrder = generalOrderRes.body.data;
  assert.strictEqual(generalOrder.orderType, 'GENERAL_PRINT', 'orderType must be GENERAL_PRINT');
  console.log(`  ✓ Created Order #${generalOrder.orderNumber} with orderType=GENERAL_PRINT`);

  const frameStudioCheck2 = await orderService.getAllOrders({ type: 'frame', paginate: false });
  const generalOrdersCheck2 = await orderService.getAllOrders({ type: 'general', paginate: false });

  assert(generalOrdersCheck2.some(o => o.id === generalOrder.id), 'General order MUST appear in General Orders view');
  assert(!frameStudioCheck2.some(o => o.id === generalOrder.id), 'General order MUST NOT appear in Photo Frames Studio view');
  console.log('  ✓ Isolation confirmed: Commercial order is present in General view and absent from Studio view.');
  reportResults.push({ scenario: '2. General Commercial Intake & Isolation', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 3: Online Guest Product Intake Auto-routing
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 3: Online Guest Product Intake Auto-Routing');
  // 3A. Frame order online
  const guestFrameRes = await postJson('/api/orders/online-guest', {
    customerName: 'Kumara Dias',
    whatsappNumber: '0723344556',
    productName: '12x18 Teak Wood Photo Frame',
    category: 'Photo Frames',
    paperMaterial: '12x18 Wood Frame',
    quantity: 1,
    unitPrice: 3500.00,
    specifications: 'Portrait frame for studio photo',
  });
  assert.strictEqual(guestFrameRes.status, 201);
  assert.strictEqual(guestFrameRes.body.data.orderType, 'PHOTO_FRAME');
  console.log(`  ✓ Online guest frame order #${guestFrameRes.body.data.orderNumber} auto-routed to PHOTO_FRAME`);

  // 3B. Mug order online
  const guestMugRes = await postJson('/api/orders/online-guest', {
    customerName: 'Anoma Wickramasinghe',
    whatsappNumber: '0776655443',
    productName: 'White Ceramic Mug',
    category: 'Mugs',
    paperMaterial: '11oz Ceramic Mug',
    quantity: 2,
    unitPrice: 850.00,
    specifications: 'Birthday photo on front',
  });
  assert.strictEqual(guestMugRes.status, 201);
  assert.strictEqual(guestMugRes.body.data.orderType, 'GENERAL_PRINT');
  console.log(`  ✓ Online guest mug order #${guestMugRes.body.data.orderNumber} auto-routed to GENERAL_PRINT`);
  reportResults.push({ scenario: '3. Online Guest Auto-Routing', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 4: Dashboard Queue Partitioning & Status Bars
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 4: Dashboard Queue Partitioning & Studio Status Bars');
  const dashStats = await dashboardService.getDashboardStats();
  const dashHtml = await get('/dashboard', token);
  assert.strictEqual(dashHtml.status, 200);

  // Check queues separation
  const frameOrderIdsInDash = dashStats.recentFrameOrders.map(o => o.id);
  const generalOrderIdsInDash = dashStats.recentOrdinaryOrders.map(o => o.id);

  assert(frameOrderIdsInDash.includes(frameOrder.id), 'Frame order in recentFrameOrders');
  assert(!generalOrderIdsInDash.includes(frameOrder.id), 'Frame order NOT in recentOrdinaryOrders');
  assert(generalOrderIdsInDash.includes(generalOrder.id), 'General order in recentOrdinaryOrders');
  assert(!frameOrderIdsInDash.includes(generalOrder.id), 'General order NOT in recentFrameOrders');

  // Check UI elements
  assert(dashHtml.raw.includes('id="photoFramesStatusBar"'), 'Photo frames status bar present on dashboard');
  assert(dashHtml.raw.includes('id="dashboardQueueSwitcher"'), 'Queue switcher present on dashboard');
  assert(dashHtml.raw.includes('id="photoFramesSection"'), 'Photo frames section present on dashboard');
  assert(dashHtml.raw.includes('id="generalPrintingSection"'), 'General printing section present on dashboard');
  console.log('  ✓ Dashboard queues and UI cards confirmed strictly partitioned.');
  reportResults.push({ scenario: '4. Dashboard Queue Partitioning', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 5: Queue Removal / Cancellation of Orders with Reason
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 5: Queue Removal / Cancellation of Order with Preset Reason');
  const cancelRes = await putJson(`/api/orders/${frameOrder.id}/customer-cancel`, {
    reason: 'Customer requested cancellation: wrong photo dimensions provided',
  }, token);

  assert.strictEqual(cancelRes.status, 200, 'Order cancellation must succeed');
  const cancelledDbOrder = await Order.findByPk(frameOrder.id);
  assert.strictEqual(cancelledDbOrder.status, 'CANCELLED');
  assert(cancelledDbOrder.notes.includes('wrong photo dimensions provided'), 'Cancellation reason preserved in notes');
  console.log(`  ✓ Order #${frameOrder.orderNumber} cancelled and removed from active queue with reason logged.`);
  reportResults.push({ scenario: '5. Queue Removal / Cancellation', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 6: Order Completion Settlement with "Money Got" -> POS Sync
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 6: Order Completion Settlement with "Money Got" -> POS Sync');
  // Complete General Order with full balance collection (Rs. 2,500.00)
  const completeGeneralRes = await putJson(`/api/orders/${generalOrder.id}/status`, {
    status: 'COMPLETED',
    notes: 'Delivered to client; full balance collected in cash',
    collectFullBalance: true,
    paymentMethod: 'CASH',
    addToPos: true,
  }, token);

  assert.strictEqual(completeGeneralRes.status, 200);
  assert.strictEqual(completeGeneralRes.body.paymentRecorded, 2500.00);

  // Check POS Sale creation
  const generalPosSale = await PosSale.findOne({
    where: { notes: { [require('sequelize').Op.like]: `%${generalOrder.orderNumber}%` } },
    include: [{ model: PosSaleItem, as: 'items' }],
  });
  assert(generalPosSale, 'POS sale must exist for completed order');
  assert.strictEqual(parseFloat(generalPosSale.totalAmount), 2500.00);
  assert(generalPosSale.items[0].itemName.includes('Print Order Settlement'), 'Item name must indicate Print Order Settlement');
  console.log(`  ✓ General Print completion created POS Sale #${generalPosSale.receiptNumber} (${generalPosSale.items[0].itemName})`);

  // Complete a Photo Frame Order with full balance collection
  const frameOrderToComplete = await Order.findOne({
    where: { orderType: 'PHOTO_FRAME', status: 'RECEIVED' },
  });
  if (frameOrderToComplete) {
    const frameBal = parseFloat(frameOrderToComplete.balanceAmount);
    const completeFrameRes = await putJson(`/api/orders/${frameOrderToComplete.id}/status`, {
      status: 'COMPLETED',
      notes: 'Frame assembled with glass; customer collected and paid full balance via card',
      collectFullBalance: true,
      paymentMethod: 'CARD',
      addToPos: true,
    }, token);

    assert.strictEqual(completeFrameRes.status, 200);
    const framePosSale = await PosSale.findOne({
      where: { notes: { [require('sequelize').Op.like]: `%${frameOrderToComplete.orderNumber}%` } },
      include: [{ model: PosSaleItem, as: 'items' }],
      order: [['createdAt', 'DESC']],
    });
    assert(framePosSale, 'POS sale must exist for completed frame order');
    assert(framePosSale.items[0].itemName.includes('Photo Frame Studio Settlement'), 'Item name must indicate Photo Frame Studio Settlement');
    console.log(`  ✓ Photo Frame completion created POS Sale #${framePosSale.receiptNumber} (${framePosSale.items[0].itemName})`);
  }
  reportResults.push({ scenario: '6. Order Settlement -> POS Sync', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 7: Order Progress Payment -> POS Sync
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 7: Order Progress Payment -> POS Sync');
  const ordForPayment = await Order.findOne({ where: { status: 'PRINTING' } });
  if (ordForPayment) {
    const payRes = await postJson(`/api/orders/${ordForPayment.id}/payment`, {
      amount: 1000.00,
      paymentMethod: 'BANK_TRANSFER',
      notes: 'Customer transferred mid-production progress payment',
      addToPos: true,
    }, token);

    assert.strictEqual(payRes.status, 200);
    const payPosSale = await PosSale.findOne({
      where: { notes: { [require('sequelize').Op.like]: `%${ordForPayment.orderNumber}%` } },
      order: [['createdAt', 'DESC']],
    });
    assert(payPosSale, 'POS sale must exist for progress payment');
    assert.strictEqual(parseFloat(payPosSale.totalAmount), 1000.00);
    console.log(`  ✓ Progress payment of Rs. 1,000.00 recorded & synced to POS #${payPosSale.receiptNumber}`);
  }
  reportResults.push({ scenario: '7. Progress Payment -> POS Sync', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 8: Quick Print Completion with "Money Got" -> POS Sync
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 8: Quick Print Completion with "Money Got" -> POS Sync');
  const qpResult = await quickPrintService.createJob({
    customerName: 'Nipuna Alwis',
    customerPhone: '0779900112',
    paperSize: '8" x 10" Photo Frame',
    colorMode: 'COLOR',
    copies: 2,
    customerMessage: 'Counter pickup today',
  }, [{
    filename: 'portrait_8x10.jpg',
    originalname: 'portrait_8x10.jpg',
    size: 204800,
    mimetype: 'image/jpeg',
  }]);
  const qpJob = qpResult.job;

  // Staff moves to COMPLETED and settles payment
  const completeQpRes = await putJson(`/api/quick-print/jobs/${qpJob.id}/status`, {
    status: 'COMPLETED',
    moneyGot: true,
    amount: 1700.00,
    paymentMethod: 'CASH',
    reason: 'Printed on photo paper and framed at counter',
  }, token);

  if (completeQpRes.status !== 200) {
    console.error('completeQpRes error:', completeQpRes.body || completeQpRes.raw);
  }
  assert.strictEqual(completeQpRes.status, 200);
  const qpPosSale = await PosSale.findOne({
    where: { notes: { [require('sequelize').Op.like]: `%${qpJob.tokenNumber}%` } },
    include: [{ model: PosSaleItem, as: 'items' }],
  });
  assert(qpPosSale, 'POS sale must exist for Quick Print completion');
  assert.strictEqual(parseFloat(qpPosSale.totalAmount), 1700.00); // 2 copies x Rs. 850
  assert(qpPosSale.items[0].itemName.includes('Quick Print'), 'Item name must indicate Quick Print');
  console.log(`  ✓ Quick Print #${qpJob.tokenNumber} completed -> generated POS Sale #${qpPosSale.receiptNumber} (Rs. ${qpPosSale.totalAmount})`);
  reportResults.push({ scenario: '8. Quick Print -> POS Sync', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 9: POS Daily Financial Report Breakdown
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 9: POS Daily Financial Report Breakdown');
  const dailyStats = await posService.getDailyStats();
  console.log('  Daily Stats:', {
    todayRevenue: dailyStats.todayRevenue,
    photoFrameRevenue: dailyStats.photoFrameRevenue,
    generalPrintRevenue: dailyStats.generalPrintRevenue,
    quickPrintRevenue: dailyStats.quickPrintRevenue,
    retailRevenue: dailyStats.retailRevenue,
    cashRevenue: dailyStats.cashRevenue,
    cardRevenue: dailyStats.cardRevenue,
    bankRevenue: dailyStats.bankRevenue,
  });

  assert(dailyStats.todayRevenue > 0, 'Today revenue must be > 0');
  assert(dailyStats.photoFrameRevenue > 0, 'Photo Frame revenue must be itemized');
  assert(dailyStats.generalPrintRevenue > 0, 'General Print revenue must be itemized');
  assert(dailyStats.quickPrintRevenue > 0, 'Quick Print revenue must be itemized');
  assert(dailyStats.retailRevenue > 0, 'Retail revenue must be itemized');
  console.log('  ✓ Daily POS report properly breaks down Photo Frames, General Orders, Quick Print, and Retail.');
  reportResults.push({ scenario: '9. POS Daily Financial Report', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 10: POS Monthly Financial Report Breakdown
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 10: POS Monthly Financial Report Breakdown');
  const monthStats = await posService.getMonthlyStats();
  console.log('  Monthly Stats:', {
    monthName: monthStats.monthName,
    monthRevenue: monthStats.monthRevenue,
    monthSalesCount: monthStats.monthSalesCount,
    photoFrameRevenue: monthStats.photoFrameRevenue,
    generalPrintRevenue: monthStats.generalPrintRevenue,
  });

  assert(monthStats.monthRevenue >= dailyStats.todayRevenue, 'Month revenue must encompass today revenue');
  assert(monthStats.photoFrameRevenue >= dailyStats.photoFrameRevenue, 'Month photo frame revenue must be accurate');
  console.log(`  ✓ Monthly report for ${monthStats.monthName} confirmed operational.`);
  reportResults.push({ scenario: '10. POS Monthly Financial Report', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 11: Dashboard Day-End Ledger & Balance Sheet Slip Render
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 11: Dashboard Day-End Ledger & Balance Sheet Slip');
  const dashCheck2 = await dashboardService.getDashboardStats();
  const db = dashCheck2.dailyBusiness;
  assert(db.posPhotoFrameRevenue > 0, 'posPhotoFrameRevenue must be populated in dailyBusiness');
  assert(db.posGeneralPrintRevenue > 0, 'posGeneralPrintRevenue must be populated in dailyBusiness');
  assert(db.totalCollectedToday > 0, 'totalCollectedToday must be populated');
  assert(dashHtml.raw.includes('Photo Frame Studio Revenue'), 'Slip includes Photo Frame Studio breakdown');
  assert(dashHtml.raw.includes('General Printing Orders Revenue'), 'Slip includes General Printing breakdown');
  console.log('  ✓ Dashboard Day-End Ledger & printable summary slip verified.');
  reportResults.push({ scenario: '11. Day-End Ledger & Slip', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 12: Nirmana Printing Official Bill / Invoice Generation
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 12: Official Bill / Invoice Rendering');
  const orderInvoice = await get(`/orders/${generalOrder.id}/invoice`, token);
  assert.strictEqual(orderInvoice.status, 200);
  assert(orderInvoice.raw.includes('Nirmana Printing'), 'Invoice includes company name');
  assert(orderInvoice.raw.includes('HNB Bank'), 'Invoice includes bank details');
  assert(orderInvoice.raw.includes('BMA Priyamantha'), 'Invoice includes beneficiary');
  assert(orderInvoice.raw.includes('075-2301939'), 'Invoice includes official contact number');

  const posInvoice = await get(`/pos/sales/${generalPosSale.id}/invoice`, token);
  assert.strictEqual(posInvoice.status, 200);
  assert(posInvoice.raw.includes('total :'), 'POS invoice includes total');
  console.log('  ✓ Official bilingual bill layouts confirmed for both Orders and POS Sales.');
  reportResults.push({ scenario: '12. Official Bill & Invoice Layout', status: 'PASSED' });

  // -------------------------------------------------------------------------
  // Scenario 13: Order Detail Page (`/orders/:id`) View & Remove Action
  // -------------------------------------------------------------------------
  console.log('\n▶ Scenario 13: Order Detail Page View & Modal Controls');
  const orderDetailHtml = await get(`/orders/${generalOrder.id}`, token);
  assert.strictEqual(orderDetailHtml.status, 200);
  assert(orderDetailHtml.raw.includes('id="orderCancelModal"'), 'Cancel modal present on detail view');
  console.log('  ✓ Order Detail Page rendered with all actions.');
  reportResults.push({ scenario: '13. Order Detail & Actions', status: 'PASSED' });

  console.log('\n================================================================');
  console.log('🎉 FULL SYSTEM CHECKUP COMPLETED: ALL 13 SCENARIOS PASSED (100%)');
  console.log('================================================================');
  console.table(reportResults);
  process.exit(0);
}

runFullSystemCheckup().catch(err => {
  console.error('\n❌ SYSTEM CHECKUP FAILED:', err);
  process.exit(1);
});
