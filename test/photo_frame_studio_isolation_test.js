const assert = require('assert');
const orderService = require('../src/services/orderService');
const posService = require('../src/services/posService');
const dashboardService = require('../src/services/dashboardService');
const { Order, PosSale, PosSaleItem, Customer, sequelize } = require('../src/models');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Photo Frame Studio Isolation & POS Reporting Test');
  console.log('================================================================');

  try {
    const timestamp = Date.now().toString().slice(-4);
    const testPhone = `077${Date.now().toString().slice(-7)}`;

    // 1. Create a Photo Frame Order explicitly
    console.log('\n--- Step 1: Create Photo Frame Order (orderType = PHOTO_FRAME) ---');
    const frameOrder = await orderService.createOrder({
      newCustomerName: `Frame Customer ${timestamp}`,
      newCustomerPhone: testPhone,
      jobTitle: `Teak Wood Portrait Photo Frame 12x18 [${timestamp}]`,
      orderType: 'PHOTO_FRAME',
      paperMaterial: '12" x 18" Photo Frame (Teak Wood & Glass)',
      quantity: 1,
      subtotal: 1800.00,
      discount: 0,
      totalAmount: 1800.00,
      advancePaid: 500.00,
      specifications: 'Teak wood border with clear glass, portrait orientation',
      status: 'RECEIVED',
    });

    console.log(`✅ Created Photo Frame Order: #${frameOrder.orderNumber} (id: ${frameOrder.id}, type: ${frameOrder.orderType})`);
    assert.strictEqual(frameOrder.orderType, 'PHOTO_FRAME', 'orderType must be PHOTO_FRAME');

    // 2. Create a General Commercial Print Order explicitly
    console.log('\n--- Step 2: Create General Commercial Print Order (orderType = GENERAL_PRINT) ---');
    const generalPhone = `071${Date.now().toString().slice(-7)}`;
    const generalOrder = await orderService.createOrder({
      newCustomerName: `Commercial Client ${timestamp}`,
      newCustomerPhone: generalPhone,
      jobTitle: `Business Cards 500 Pcs Matte Laminated [${timestamp}]`,
      orderType: 'GENERAL_PRINT',
      paperMaterial: '350gsm Art Card Matte',
      quantity: 500,
      subtotal: 2500.00,
      discount: 200.00,
      totalAmount: 2300.00,
      advancePaid: 1000.00,
      specifications: 'Double sided full color print, matte lamination, square corners',
      status: 'RECEIVED',
    });

    console.log(`✅ Created General Print Order: #${generalOrder.orderNumber} (id: ${generalOrder.id}, type: ${generalOrder.orderType})`);
    assert.strictEqual(generalOrder.orderType, 'GENERAL_PRINT', 'orderType must be GENERAL_PRINT');

    // 3. Verify Strict Mutual Exclusivity in getAllOrders
    console.log('\n--- Step 3: Verify Strict Isolation in Order Queries ---');
    
    // 3A. Query Photo Frames Studio (/orders?type=frame)
    const frameStudioResult = await orderService.getAllOrders({
      type: 'frame',
      limit: 100,
      paginate: false,
    });
    const frameIdsInStudio = frameStudioResult.map(o => o.id);
    console.log(`Photo Frame Studio contains ${frameIdsInStudio.length} orders.`);
    assert(frameIdsInStudio.includes(frameOrder.id), 'Photo Frame Order MUST appear in Photo Frame Studio');
    assert(!frameIdsInStudio.includes(generalOrder.id), 'General Print Order MUST NOT appear in Photo Frame Studio');
    console.log('✅ PASS: Photo Frame Studio contains ONLY frame orders; general orders are strictly excluded.');

    // 3B. Query General Commercial Orders (/orders?type=general)
    const generalOrdersResult = await orderService.getAllOrders({
      type: 'general',
      limit: 100,
      paginate: false,
    });
    const orderIdsInGeneral = generalOrdersResult.map(o => o.id);
    console.log(`General Orders view contains ${orderIdsInGeneral.length} orders.`);
    assert(orderIdsInGeneral.includes(generalOrder.id), 'General Print Order MUST appear in General Orders');
    assert(!orderIdsInGeneral.includes(frameOrder.id), 'Photo Frame Order MUST NOT appear in General Orders');
    console.log('✅ PASS: General Orders view contains ONLY general print orders; photo frame orders do NOT appear there.');

    // 4. Complete Photo Frame Order with "Money Got" and verify POS Sync
    console.log('\n--- Step 4: Complete Photo Frame Order with Balance Settlement -> Verify POS Sale Sync ---');
    const frameBalanceToCollect = parseFloat(frameOrder.balanceAmount); // 1300.00
    const frameCompletionResult = await orderService.updateOrderStatus(
      frameOrder.id,
      'COMPLETED',
      'Customer collected frame from studio and paid balance in cash',
      {
        collectFullBalance: true,
        paymentMethod: 'CASH',
        addToPos: true,
      }
    );

    console.log(`Settled balance of Rs. ${frameCompletionResult.paymentRecorded} on #${frameOrder.orderNumber}`);
    assert.strictEqual(frameCompletionResult.paymentRecorded, frameBalanceToCollect, 'Full balance was collected');

    // Check POS sale was created with Photo Frame Studio labeling
    const latestPosSaleForFrame = await PosSale.findOne({
      where: {
        notes: { [require('sequelize').Op.like]: `%${frameOrder.orderNumber}%` },
      },
      include: [{ model: PosSaleItem, as: 'items' }],
      order: [['createdAt', 'DESC']],
    });

    assert(latestPosSaleForFrame, 'POS Sale record must exist for frame order completion');
    console.log(`Found POS Sale #${latestPosSaleForFrame.receiptNumber} for order #${frameOrder.orderNumber}`);
    assert(latestPosSaleForFrame.notes.includes('Photo Frame Studio Settlement'), 'Notes must indicate Photo Frame Studio Settlement');
    assert(latestPosSaleForFrame.items[0].itemName.includes('Photo Frame Studio Settlement'), 'Item name must indicate Photo Frame Studio Settlement');
    console.log(`✅ PASS: POS Sale properly tagged as: "${latestPosSaleForFrame.items[0].itemName}"`);

    // 5. Complete General Print Order with "Money Got" and verify POS Sync
    console.log('\n--- Step 5: Complete General Print Order with Balance Settlement -> Verify POS Sale Sync ---');
    const generalBalanceToCollect = parseFloat(generalOrder.balanceAmount); // 1300.00
    const generalCompletionResult = await orderService.updateOrderStatus(
      generalOrder.id,
      'COMPLETED',
      'Client picked up business cards and paid balance via bank transfer',
      {
        collectFullBalance: true,
        paymentMethod: 'BANK_TRANSFER',
        addToPos: true,
      }
    );

    console.log(`Settled balance of Rs. ${generalCompletionResult.paymentRecorded} on #${generalOrder.orderNumber}`);
    const latestPosSaleForGeneral = await PosSale.findOne({
      where: {
        notes: { [require('sequelize').Op.like]: `%${generalOrder.orderNumber}%` },
      },
      include: [{ model: PosSaleItem, as: 'items' }],
      order: [['createdAt', 'DESC']],
    });

    assert(latestPosSaleForGeneral, 'POS Sale record must exist for general print order completion');
    assert(latestPosSaleForGeneral.notes.includes('Order Settlement'), 'Notes must indicate Order Settlement');
    assert(latestPosSaleForGeneral.items[0].itemName.includes('Print Order Settlement'), 'Item name must indicate Print Order Settlement');
    console.log(`✅ PASS: General Print POS Sale tagged as: "${latestPosSaleForGeneral.items[0].itemName}"`);

    // 6. Test Daily and Monthly Reporting in POS Service
    console.log('\n--- Step 6: Verify Daily & Monthly Reports in posService ---');
    const dailyStats = await posService.getDailyStats();
    console.log('Daily POS Stats:', {
      todayRevenue: dailyStats.todayRevenue,
      todaySalesCount: dailyStats.todaySalesCount,
      photoFrameRevenue: dailyStats.photoFrameRevenue,
      generalPrintRevenue: dailyStats.generalPrintRevenue,
      cashRevenue: dailyStats.cashRevenue,
      bankRevenue: dailyStats.bankRevenue,
    });

    assert(dailyStats.photoFrameRevenue >= frameBalanceToCollect, 'Photo Frame Revenue must reflect frame order settlement in daily report');
    assert(dailyStats.generalPrintRevenue >= generalBalanceToCollect, 'General Print Revenue must reflect print order settlement in daily report');
    console.log('✅ PASS: Daily POS stats properly itemize photo frame revenue and general print revenue.');

    const monthlyStats = await posService.getMonthlyStats();
    console.log('Monthly POS Stats:', {
      monthName: monthlyStats.monthName,
      monthRevenue: monthlyStats.monthRevenue,
      photoFrameRevenue: monthlyStats.photoFrameRevenue,
      generalPrintRevenue: monthlyStats.generalPrintRevenue,
    });
    assert(monthlyStats.photoFrameRevenue >= frameBalanceToCollect, 'Monthly report must include photo frame revenue');
    assert(monthlyStats.generalPrintRevenue >= generalBalanceToCollect, 'Monthly report must include general print revenue');
    console.log('✅ PASS: Monthly POS report properly includes channel breakdown.');

    // 7. Test Dashboard Stats
    console.log('\n--- Step 7: Verify Dashboard Service Stats & Isolation ---');
    const dashboardStats = await dashboardService.getDashboardStats();
    const frameOrdersInDash = dashboardStats.recentFrameOrders.map(o => o.id);
    const ordinaryOrdersInDash = dashboardStats.recentOrdinaryOrders.map(o => o.id);

    assert(frameOrdersInDash.includes(frameOrder.id), 'Frame order must be in dashboard recentFrameOrders');
    assert(!ordinaryOrdersInDash.includes(frameOrder.id), 'Frame order must NOT be in dashboard recentOrdinaryOrders');
    assert(ordinaryOrdersInDash.includes(generalOrder.id), 'General order must be in dashboard recentOrdinaryOrders');
    assert(!frameOrdersInDash.includes(generalOrder.id), 'General order must NOT be in dashboard recentFrameOrders');

    console.log('Dashboard dailyBusiness channel breakdown:', {
      posPhotoFrameRevenue: dashboardStats.dailyBusiness.posPhotoFrameRevenue,
      posGeneralPrintRevenue: dashboardStats.dailyBusiness.posGeneralPrintRevenue,
      posQuickPrintRevenue: dashboardStats.dailyBusiness.posQuickPrintRevenue,
      posRetailCounterRevenue: dashboardStats.dailyBusiness.posRetailCounterRevenue,
    });
    assert(dashboardStats.dailyBusiness.posPhotoFrameRevenue >= frameBalanceToCollect, 'Dashboard daily business must itemize photo frame revenue');
    console.log('✅ PASS: Dashboard cleanly isolates frame orders into studio queue and itemizes revenue in daily report.');

    console.log('\n================================================================');
    console.log('🎉 ALL ASSERTIONS PASSED (100% SUCCESS)');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();

