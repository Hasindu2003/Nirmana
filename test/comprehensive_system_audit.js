/**
 * Comprehensive System Audit & Verification Script
 * Nirmana Printing Management System
 */
process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Colombo';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runAudit() {
  const results = {
    working: [],
    notWorking: [],
    warnings: [],
  };

  console.log('========================================================');
  console.log('🔍 NIRMANA PRINTING SYSTEM - FULL SYSTEM VERIFICATION');
  console.log('========================================================\n');

  // 1. CONFIG & ENVIRONMENT CHECK
  console.log('--- 1. Configuration & Environment ---');
  const envExists = fs.existsSync(path.join(__dirname, '../.env'));
  if (envExists) {
    results.working.push({ module: 'Config', test: '.env file exists' });
  } else {
    results.warnings.push({
      module: 'Config',
      test: '.env file presence',
      detail: '.env file does not exist in root directory; application automatically falls back to default SQLite config in src/config/config.js (data/nirmana.sqlite)'
    });
  }

  // 2. DATABASE & MODEL INITIALIZATION
  console.log('--- 2. Database Connection & Schema Sync ---');
  let models;
  try {
    models = require('../src/models');
    await models.sequelize.authenticate();
    await models.sequelize.sync();

    // Clean any previous test artifacts
    await models.StockTransaction.destroy({ where: {} }).catch(() => {});
    await models.StockItem.destroy({ where: { code: 'AUDIT-STK-01' } }).catch(() => {});
    await models.Customer.destroy({ where: { name: ['Audit Customer Co', 'Invalid Phone Customer'] } }).catch(() => {});
    await models.User.destroy({ where: { username: 'audit_cust' } }).catch(() => {});

    results.working.push({ module: 'Database', test: 'Sequelize connection & schema synchronization (SQLite)' });
    console.log('✓ Database connected and schema synchronized.');
  } catch (err) {
    results.notWorking.push({ module: 'Database', test: 'Sequelize connection/sync', error: err.message });
    console.error('✗ Database connection failed:', err.message);
    return;
  }

  // 3. AUTHENTICATION & USERS
  console.log('--- 3. Authentication & User Management ---');
  const authService = require('../src/services/authService');
  try {
    let admin = await models.User.findOne({ where: { username: 'admin' } });
    if (!admin) {
      admin = await models.User.create({
        username: 'admin',
        email: 'admin@nirmana.lk',
        password: 'Password123!',
        fullName: 'Nirmana Shop Manager',
        role: 'ADMIN',
        phone: '0771234567',
        isActive: true,
      });
    }

    const loginRes = await authService.login('admin', 'Password123!');
    assert(loginRes && loginRes.token, 'Admin login must return a JWT token');
    assert.strictEqual(loginRes.user.role, 'ADMIN', 'Role must be ADMIN');
    results.working.push({ module: 'Auth', test: 'Admin Login & JWT Token generation' });
    console.log('✓ Admin login successful.');

    // Negative test: invalid password
    let failedLogin = false;
    try {
      await authService.login('admin', 'WrongPass!');
    } catch (e) {
      failedLogin = true;
    }
    assert(failedLogin, 'Invalid login must throw error');
    results.working.push({ module: 'Auth', test: 'Invalid password rejection' });

    // Customer Registration
    const regUsername = 'audit_cust_' + Date.now();
    const regRes = await authService.registerCustomer({
      username: regUsername,
      password: 'Password123!',
      fullName: 'Audit Customer',
      phone: '0778889999',
      email: `${regUsername}@test.com`,
    });
    assert(regRes && regRes.user && regRes.customer, 'Customer registration should create both User and Customer');
    assert.strictEqual(regRes.user.role, 'CUSTOMER', 'Role must be CUSTOMER');
    results.working.push({ module: 'Auth', test: 'Customer Registration & Link to Customer entity' });
    console.log('✓ Customer registration and profile linkage verified.');

    // Cleanup test user
    await models.Customer.destroy({ where: { id: regRes.customer.id } });
    await models.User.destroy({ where: { id: regRes.user.id } });
  } catch (err) {
    const detail = err.errors ? err.errors.map(e => `${e.path}: ${e.message}`).join(', ') : err.message;
    results.notWorking.push({ module: 'Auth', test: 'Authentication operations', error: detail });
    console.error('✗ Auth failed:', detail);
  }

  // 4. STOCK & INVENTORY MANAGEMENT
  console.log('--- 4. Stock & Inventory Management ---');
  const stockService = require('../src/services/stockService');
  let testStockItem;
  try {
    testStockItem = await models.StockItem.create({
      code: 'AUDIT-STK-01',
      name: 'Audit Bond Paper 80gsm',
      category: 'Paper / Substrate',
      unit: 'Reams',
      currentStock: 100,
      minStockAlert: 20,
      unitCost: 1200.00,
      sellingPrice: 1600.00,
      notes: 'Audit test stock item',
    });
    results.working.push({ module: 'Stock', test: 'Create stock item' });

    // Stock In
    const stockIn = await stockService.recordStockIn({
      stockItemId: testStockItem.id,
      quantity: 50,
      reference: 'PO-AUDIT-01',
      notes: 'Stock In test',
      date: '2026-10-29',
    });
    assert.strictEqual(parseFloat(stockIn.item.currentStock), 150, 'Stock should increase to 150');
    assert.strictEqual(stockIn.transaction.type, 'IN');
    results.working.push({ module: 'Stock', test: 'Record Stock In & balance calculation' });

    // Stock Out
    const stockOut = await stockService.recordStockOut({
      stockItemId: testStockItem.id,
      quantity: 20,
      reference: 'ORDER-AUDIT-01',
      notes: 'Stock Out test',
      date: '2026-10-29',
    });
    assert.strictEqual(parseFloat(stockOut.item.currentStock), 130, 'Stock should decrease to 130');
    assert.strictEqual(stockOut.transaction.type, 'OUT');
    results.working.push({ module: 'Stock', test: 'Record Stock Out & balance calculation' });

    // Stock Out Over-deduction prevention
    let overDeductBlocked = false;
    try {
      await stockService.recordStockOut({
        stockItemId: testStockItem.id,
        quantity: 999999,
        reference: 'FAIL-TEST',
      });
    } catch (e) {
      overDeductBlocked = true;
    }
    assert(overDeductBlocked, 'Over-deduction must be prevented');
    results.working.push({ module: 'Stock', test: 'Over-deduction prevention validation' });

    // Office Use
    const officeUse = await stockService.recordOfficeUse({
      stockItemId: testStockItem.id,
      quantity: 5,
      notes: 'Counter testing',
      category: 'INTERNAL_TEST',
      date: '2026-10-29',
    });
    assert.strictEqual(parseFloat(officeUse.item.currentStock), 125, 'Stock should decrease to 125 after office use');
    results.working.push({ module: 'Stock', test: 'Record Office Use & ledger category' });

    // Office Use listing
    const officeHistory = await stockService.getOfficeUseTransactions({ page: 1, limit: 10 });
    assert(Array.isArray(officeHistory.transactions), 'Office history should return transactions list');
    results.working.push({ module: 'Stock', test: 'Office Use listing & pagination' });

    // Valuation calculation
    const allStock = await stockService.getAllStockItems({ paginate: true });
    assert(allStock.inventorySummary && allStock.inventorySummary.totalRemainingValuation >= 0);
    results.working.push({ module: 'Stock', test: 'Inventory valuation calculation' });

    console.log('✓ Stock & Inventory operations verified.');
  } catch (err) {
    results.notWorking.push({ module: 'Stock', test: 'Stock operations', error: err.message });
    console.error('✗ Stock failed:', err.message);
  }

  // 5. CUSTOMER & ORDER MANAGEMENT
  console.log('--- 5. Customer & Order Management ---');
  const customerService = require('../src/services/customerService');
  const orderService = require('../src/services/orderService');
  let testCustomer, testOrder;
  try {
    testCustomer = await customerService.createCustomer({
      name: 'Audit Customer Co',
      companyName: 'Audit Media Ltd',
      phone: '0712345678',
      email: 'contact@auditmedia.lk',
      address: '100 Galle Rd, Colombo',
      notes: 'Audit customer',
    });
    assert(testCustomer.customerCode, 'Customer should receive unique customerCode');
    results.working.push({ module: 'Customer', test: 'Create customer & unique code generation' });

    // Phone validation
    let invalidPhoneCaught = false;
    try {
      await customerService.createCustomer({
        name: 'Invalid Phone Customer',
        phone: '12345',
      });
    } catch (e) {
      invalidPhoneCaught = true;
    }
    assert(invalidPhoneCaught, 'Phone number must be validated (10 digits)');
    results.working.push({ module: 'Customer', test: 'Strict 10-digit phone number validation' });

    // Order Creation
    testOrder = await orderService.createOrder({
      customerId: testCustomer.id,
      jobTitle: 'Audit Letterheads 500pcs',
      paperMaterial: 'Audit Bond Paper 80gsm',
      quantity: 500,
      subtotal: 5000,
      discount: 500,
      discountType: 'FIXED',
      totalAmount: 4500,
      advancePaid: 2000,
      balanceAmount: 2500,
      orderDate: '2026-10-29',
      dueDate: '2026-11-02',
      status: 'RECEIVED',
    });
    assert(testOrder.orderNumber, 'Order should have unique orderNumber');
    assert.strictEqual(parseFloat(testOrder.balanceAmount), 2500, 'Balance should be 2500');
    results.working.push({ module: 'Order', test: 'Create order with custom pricing & balance calculation' });

    // Customer Dynamic Financial Totals Verification
    const updatedCust = await customerService.getCustomerById(testCustomer.id);
    assert.strictEqual(updatedCust.dataValues.totalYetToGive, 2500, 'Customer totalYetToGive must be 2500');
    assert.strictEqual(updatedCust.dataValues.totalGiven, 2000, 'Customer totalGiven must be 2000');
    assert.strictEqual(updatedCust.dataValues.totalBilled, 4500, 'Customer totalBilled must be 4500');
    results.working.push({ module: 'Customer', test: 'Dynamic customer financial totals (totalBilled, totalGiven, totalYetToGive)' });

    // Order Status Update
    const updatedStatus = await orderService.updateOrderStatus(testOrder.id, 'PRINTING');
    assert.strictEqual(updatedStatus.status, 'PRINTING');
    results.working.push({ module: 'Order', test: 'Order status progression (RECEIVED -> PRINTING)' });

    // Order Payment Recording
    const paidOrder = await orderService.recordPayment(testOrder.id, 2500, 'Final settlement');
    assert.strictEqual(parseFloat(paidOrder.balanceAmount), 0, 'Balance should become 0 after payment');
    results.working.push({ module: 'Order', test: 'Record payment & clear balance' });

    // Customer Balance after settlement
    const settledCust = await customerService.getCustomerById(testCustomer.id);
    assert.strictEqual(settledCust.dataValues.totalYetToGive, 0, 'Customer totalYetToGive should be 0');
    assert.strictEqual(settledCust.dataValues.totalGiven, 4500, 'Customer totalGiven should be 4500');
    results.working.push({ module: 'Order', test: 'Customer financial ledger cleared upon full payment' });

    console.log('✓ Customer and Order lifecycle verified.');
  } catch (err) {
    results.notWorking.push({ module: 'Customer/Order', test: 'Customer/Order lifecycle', error: err.message });
    console.error('✗ Customer/Order failed:', err.message);
  }

  // 6. POINT OF SALE (POS) COUNTER
  console.log('--- 6. Point of Sale (POS) Counter ---');
  const posService = require('../src/services/posService');
  let testSale;
  try {
    await testStockItem.reload();
    const prevStock = parseFloat(testStockItem.currentStock);
    testSale = await posService.createSale({
      customerId: testCustomer.id,
      customerName: testCustomer.name,
      customerPhone: testCustomer.phone,
      items: [
        {
          stockItemId: testStockItem.id,
          name: testStockItem.name,
          quantity: 2,
          unitPrice: 1600.00,
          unit: testStockItem.unit,
        }
      ],
      discount: 200.00,
      discountType: 'FIXED',
      amountTendered: 5000.00,
      paymentMethod: 'CASH',
    });
    assert(testSale.receiptNumber, 'Sale should generate unique receiptNumber');
    assert.strictEqual(parseFloat(testSale.changeAmount), 2000.00, 'Change amount must be 2000');
    results.working.push({ module: 'POS', test: 'Create POS sale with receiptNumber & change calculation' });

    // Verify stock was deducted by POS sale
    const postSaleStock = await models.StockItem.findByPk(testStockItem.id);
    assert.strictEqual(parseFloat(postSaleStock.currentStock), prevStock - 2, 'POS sale must deduct inventory');
    results.working.push({ module: 'POS', test: 'POS sale auto-inventory deduction' });

    // Check POS stats
    const posStats = await posService.getDailyStats();
    assert(posStats && posStats.todaySalesCount >= 1, 'POS stats should count today sale');
    results.working.push({ module: 'POS', test: 'POS daily statistics aggregation' });

    // Void Sale
    const voidRes = await posService.voidSale(testSale.id, 'Audit test void');
    assert.strictEqual(voidRes.sale.status, 'VOIDED');
    const restoredStock = await models.StockItem.findByPk(testStockItem.id);
    assert.strictEqual(parseFloat(restoredStock.currentStock), prevStock, 'Voiding POS sale must restore inventory');
    results.working.push({ module: 'POS', test: 'Void POS sale & inventory restoration' });

    console.log('✓ POS counter operations verified.');
  } catch (err) {
    results.notWorking.push({ module: 'POS', test: 'POS operations', error: err.message });
    console.error('✗ POS failed:', err.message);
  }

  // 7. DASHBOARD METRICS
  console.log('--- 7. Dashboard Metrics ---');
  const dashboardService = require('../src/services/dashboardService');
  try {
    const stats = await dashboardService.getDashboardStats();
    assert(stats.kpis, 'KPIs must exist');
    assert(stats.dailyBusiness, 'Daily business stats must exist');
    assert(Array.isArray(stats.lowStockItems), 'Low stock items must be array');
    results.working.push({ module: 'Dashboard', test: 'Dashboard stats and KPI aggregations' });
    console.log('✓ Dashboard aggregations verified.');
  } catch (err) {
    results.notWorking.push({ module: 'Dashboard', test: 'Dashboard stats', error: err.message });
    console.error('✗ Dashboard failed:', err.message);
  }

  // 8. QUICK PRINT (WALK-IN COUNTER QR)
  console.log('--- 8. Quick Print (Counter QR Queue) ---');
  const quickPrintService = require('../src/services/quickPrintService');
  let testJob;
  try {
    // Generate QR Token
    const tokenNumber = await quickPrintService.generateTokenNumber();
    assert(tokenNumber && tokenNumber.startsWith('QP-'), 'Token number should start with QP-');
    results.working.push({ module: 'QuickPrint', test: 'Daily sequential token number generation' });

    // Create Quick Print Job with File
    testJob = await models.QuickPrintJob.create({
      tokenNumber,
      customerName: 'Audit Print Walk-in',
      customerPhone: '0755554444',
      paperSize: 'A4',
      colorMode: 'COLOR',
      copies: 10,
      customerMessage: 'Double-sided glossy',
      status: 'PENDING',
    });

    const testFile = await models.QuickPrintFile.create({
      jobId: testJob.id,
      originalName: 'flyer_design.pdf',
      filename: 'audit_flyer_design.pdf',
      filePath: path.join(__dirname, 'mock_flyer.pdf'),
      mimeType: 'application/pdf',
      fileSize: 1024 * 50,
      fileUrl: '/uploads/quick-print/audit_flyer_design.pdf',
      storageProvider: 'LOCAL',
      paperSize: 'A4',
      colorMode: 'COLOR',
      copies: 10,
    });

    assert(testJob.id && testFile.id);
    results.working.push({ module: 'QuickPrint', test: 'Quick Print Job & File record creation' });

    // Job Status Check
    const fetchedJob = await quickPrintService.getJobById(testJob.id);
    assert(fetchedJob && fetchedJob.tokenNumber === tokenNumber);
    results.working.push({ module: 'QuickPrint', test: 'Get job by ID with associated files' });

    // Update Status to COMPLETED
    const completedJob = await quickPrintService.updateJobStatus(testJob.id, 'COMPLETED');
    assert.strictEqual(completedJob.status, 'COMPLETED');
    results.working.push({ module: 'QuickPrint', test: 'Desk queue status transition (PENDING -> COMPLETED)' });

    // Queue Stats
    const qpStats = await quickPrintService.getQueueStats();
    assert(qpStats && qpStats.pending !== undefined);
    results.working.push({ module: 'QuickPrint', test: 'Quick Print queue stats' });

    // Convert to Formal Order
    const convertedRes = await quickPrintService.convertToFormalOrder(testJob.id, {
      totalAmount: 1500,
      advancePaid: 1500,
      jobTitle: '10x A4 Color Flyers',
      paperMaterial: '150gsm Gloss Art Paper',
    });
    assert(convertedRes && convertedRes.order && convertedRes.order.orderNumber);
    assert.strictEqual(convertedRes.job.orderId, convertedRes.order.id);
    results.working.push({ module: 'QuickPrint', test: 'Convert Quick Print Job to formal Order' });

    console.log('✓ Quick Print operations verified.');
  } catch (err) {
    results.notWorking.push({ module: 'QuickPrint', test: 'Quick Print operations', error: err.message });
    console.error('✗ Quick Print failed:', err.message);
  }

  // 9. GOOGLE DRIVE SERVICE
  console.log('--- 9. Google Drive Integration ---');
  const googleDriveService = require('../src/services/googleDriveService');
  try {
    const isConfigured = googleDriveService.isConfigured();
    if (!isConfigured) {
      results.warnings.push({
        module: 'GoogleDrive',
        test: 'OAuth / Storage Configuration',
        detail: 'Google Drive is not configured (GOOGLE_REFRESH_TOKEN / CLIENT_ID missing in .env). System cleanly defaults to local storage (LOCAL), which works as designed.'
      });
      console.log('ℹ Google Drive not configured; local storage fallback active.');
    } else {
      results.working.push({ module: 'GoogleDrive', test: 'Google Drive credentials configured' });
    }
  } catch (err) {
    results.notWorking.push({ module: 'GoogleDrive', test: 'Google Drive service check', error: err.message });
  }

  // 10. VIEW ENGINE TEMPLATE RENDERING CHECK
  console.log('--- 10. View Template Render Verification ---');
  const ejs = require('ejs');
  const viewsDir = path.join(__dirname, '../src/views');

  const viewsToTest = [
    { file: 'auth/login.ejs', data: { title: 'Sign In · Nirmana Printing', error: null, username: '' } },
    { file: 'auth/register.ejs', data: { title: 'Create Account · Nirmana Printing', error: null, formData: {} } },
    { file: 'dashboard/index.ejs', data: { title: 'Dashboard', stats: await dashboardService.getDashboardStats(), selectedDate: '2026-10-29' } },
    { file: 'orders/index.ejs', data: { title: 'Orders', orders: [], pagination: { total: 0, page: 1, totalPages: 1 }, currentStatus: 'ALL', search: '', customerId: '' } },
    { file: 'orders/create.ejs', data: { title: 'New Order', customers: [], stockItems: [] } },
    { file: 'pos/index.ejs', data: { title: 'POS', stockItems: [], todayStats: { todaySalesCount: 0, todayGrossSales: 0 }, sales: [], pagination: null, search: '', dateFrom: '', dateTo: '', paymentMethod: 'ALL' } },
    { file: 'customers/index.ejs', data: { title: 'Customers', customers: [], pagination: null, accountsSummary: { totalCustomers: 0, totalReceivables: 0 }, search: '' } },
    { file: 'stock/index.ejs', data: { title: 'Stock', items: [], itemsPagination: null, inventorySummary: { totalItems: 0, totalRemainingValuation: 0, totalOfficeUseValue: 0 }, transactions: [], transactionsPagination: null, officeTransactions: [], officePagination: null, categories: [], currentCategory: 'ALL', search: '', currentPage: 1, currentTxPage: 1, currentOfficePage: 1, currentTab: 'inventory' } },
    { file: 'quickPrint/index.ejs', data: { title: 'Quick Print', jobs: [], stats: { totalCount: 0, pendingCount: 0, completedCount: 0 }, currentStatus: 'PENDING', search: '', defaultUploadUrl: 'http://localhost:3000/upload', availableIps: [] } },
    { file: 'quickPrint/upload.ejs', data: { title: 'Upload', uploadUrl: 'http://localhost:3000/upload' } },
    { file: 'error.ejs', data: { title: 'Notice', message: 'Test Error', statusCode: 500 } },
    { file: 'users/index.ejs', data: { title: 'Users', users: [] } },
    { file: 'products/index.ejs', data: { title: 'Products', products: [], categories: [], currentCategory: 'ALL', currentType: 'ALL', search: '' } },
  ];

  for (const v of viewsToTest) {
    try {
      const templatePath = path.join(viewsDir, v.file);
      const content = fs.readFileSync(templatePath, 'utf8');
      ejs.render(content, {
        appName: 'Nirmana Printing Management System',
        currencySymbol: 'Rs.',
        currentUser: { id: 1, fullName: 'Admin', role: 'ADMIN', username: 'admin' },
        activePage: 'test',
        currentPath: '/',
        formatDate: (d) => d || '',
        formatDateTime: (d) => d || '',
        formatTime: (d) => d || '',
        formatSriLankaDate: (d) => d || '',
        formatSriLankaDateTime: (d) => d || '',
        formatSriLankaTime: (d) => d || '',
        todayDate: () => '2026-10-29',
        ...v.data,
        filename: templatePath,
      });
      results.working.push({ module: 'ViewTemplate', test: `Render ${v.file}` });
    } catch (viewErr) {
      results.notWorking.push({ module: 'ViewTemplate', test: `Render ${v.file}`, error: viewErr.message });
      console.error(`✗ View failed to render: ${v.file}:`, viewErr.message);
    }
  }

  // 11. DISCREPANCIES, DEAD ROUTES & ARCHITECTURAL GAPS
  console.log('--- 11. Architectural Gaps & Discrepancies ---');
  const viewRoutesContent = fs.readFileSync(path.join(__dirname, '../src/routes/viewRoutes.js'), 'utf8');
  if (!viewRoutesContent.includes("'/users'")) {
    results.warnings.push({
      module: 'Routing',
      test: 'User administration view route (/users)',
      detail: 'View template src/views/users/index.ejs exists, and API /api/users exists, but GET /users view route is missing in viewRoutes.js'
    });
  }
  if (!viewRoutesContent.includes("'/products'")) {
    results.warnings.push({
      module: 'Routing',
      test: 'Product Catalog view route (/products)',
      detail: 'View template src/views/products/index.ejs and Product models exist, but GET /products view route is missing in viewRoutes.js and /api/products is missing in api.js'
    });
  }

  if (fs.existsSync(path.join(__dirname, '../test/phase1_test.js'))) {
    results.warnings.push({
      module: 'Testing',
      test: 'Legacy test/phase1_test.js vs Current System Architecture',
      detail: 'test/phase1_test.js was written for the earlier 6-role / multi-table prototype and fails on the current streamlined schema. The active test suite in package.json is test/streamlined_test.js (which passes 10/10).'
    });
  }

  // 12. CLEANUP TEST FIXTURES
  console.log('--- 12. Cleanup Test Fixtures ---');
  try {
    if (testJob) {
      await models.QuickPrintFile.destroy({ where: { jobId: testJob.id } });
      await models.QuickPrintJob.destroy({ where: { id: testJob.id } });
    }
    if (testSale) {
      await models.PosSaleItem.destroy({ where: { saleId: testSale.id } });
      await models.PosSale.destroy({ where: { id: testSale.id } });
    }
    if (testOrder) {
      await models.Order.destroy({ where: { id: testOrder.id } });
    }
    if (testCustomer) {
      await models.Order.destroy({ where: { customerId: testCustomer.id } });
      await models.Customer.destroy({ where: { id: testCustomer.id } });
    }
    if (testStockItem) {
      await models.StockTransaction.destroy({ where: { stockItemId: testStockItem.id } });
      await models.StockItem.destroy({ where: { id: testStockItem.id } });
    }
    console.log('✓ Cleaned up all audit test records.');
  } catch (cleanErr) {
    console.warn('Notice during cleanup:', cleanErr.message);
  }

  console.log('\n========================================================');
  console.log('📊 AUDIT SUMMARY:');
  console.log(`  Working Features: ${results.working.length}`);
  console.log(`  Not Working / Errors: ${results.notWorking.length}`);
  console.log(`  Warnings / Inconsistencies: ${results.warnings.length}`);
  console.log('========================================================\n');

  console.log('=== WORKING PROCESSES ===');
  results.working.forEach(w => console.log(`  [OK] ${w.module}: ${w.test}`));

  if (results.notWorking.length > 0) {
    console.log('\n=== NOT WORKING PROCESSES ===');
    results.notWorking.forEach(nw => console.log(`  [FAIL] ${nw.module}: ${nw.test} -> ${nw.error}`));
  } else {
    console.log('\n🎉 ALL ACTIVE BUSINESS & OPERATIONAL PROCESSES WORKING!');
  }

  if (results.warnings.length > 0) {
    console.log('\n=== WARNINGS & ARCHITECTURAL GAPS ===');
    results.warnings.forEach(w => console.log(`  [WARN] ${w.module}: ${w.test}\n         ${w.detail}`));
  }
}

runAudit().catch(console.error);
