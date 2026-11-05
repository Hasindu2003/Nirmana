const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authController = require('../controllers/authController');
const dashboardService = require('../services/dashboardService');
const orderService = require('../services/orderService');
const stockService = require('../services/stockService');
const customerService = require('../services/customerService');
const quickPrintService = require('../services/quickPrintService');
const posService = require('../services/posService');
const productService = require('../services/productService');
const googleDriveService = require('../services/googleDriveService');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { authenticate } = require('../middleware/auth');
const { requireStaff, requireRole } = require('../middleware/rbac');
const { getUploadUrl, getAvailableLanIps } = require('../utils/network');
const QRCode = require('qrcode');

// Helper to check if visitor is already authenticated (cookie or session)
function getDecodedUser(req) {
  const token = req.cookies && req.cookies.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded && decoded.id) return decoded;
    } catch (e) {}
  }
  return null;
}

function isAuthenticated(req) {
  if (getDecodedUser(req)) return true;
  if (req.session && req.session.userId) return true;
  return false;
}

// =========================================================================
// 1. PUBLIC ROUTES (No Login Required)
// =========================================================================

// Root redirect: Logged in -> Dashboard / Portal | Visitors -> Login
router.get('/', (req, res) => {
  const decoded = getDecodedUser(req);
  if (decoded) {
    if (decoded.role === 'CUSTOMER') return res.redirect('/portal');
    return res.redirect('/dashboard');
  }
  if (req.session && req.session.userId) {
    if (req.session.userRole === 'CUSTOMER') return res.redirect('/portal');
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// Staff / Customer Login
router.get('/login', (req, res) => {
  const decoded = getDecodedUser(req);
  if (decoded) {
    if (decoded.role === 'CUSTOMER') return res.redirect('/portal');
    return res.redirect('/dashboard');
  }
  if (req.session && req.session.userId) {
    if (req.session.userRole === 'CUSTOMER') return res.redirect('/portal');
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Sign In · Nirmana Printing',
    error: null,
    username: '',
    activePage: 'login',
  });
});

// Customer Account Registration
router.get('/register', (req, res) => {
  const decoded = getDecodedUser(req);
  if (decoded) {
    if (decoded.role === 'CUSTOMER') return res.redirect('/portal');
    return res.redirect('/dashboard');
  }
  res.render('auth/register', {
    title: 'Create Account · Nirmana Printing',
    error: null,
    formData: {},
    activePage: 'register',
  });
});

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Walk-in Customer Self-Service Upload (Mobile QR Destination & Fallback)
router.get(['/upload', '/quick-print/upload'], (req, res) => {
  const defaultUploadUrl = getUploadUrl(req);
  res.render('quickPrint/upload', {
    title: 'Self-Service Print Station · Nirmana Printing',
    activePage: 'guest-upload',
    uploadUrl: defaultUploadUrl,
  });
});

// Public Products & Print Services Catalog (Accessible by unregistered guests, regular customers & staff)
router.get('/products', async (req, res, next) => {
  try {
    const { category, search, type } = req.query;
    const { products, categories } = await productService.getAllCatalogProducts({
      category: category || 'ALL',
      search: search || '',
      type: type || 'ALL',
    });

    res.render('products/index', {
      title: 'Products & Services Catalog · Nirmana Printing',
      activePage: 'products',
      products,
      categories,
      currentCategory: category || 'ALL',
      currentType: type || 'ALL',
      search: search || '',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await productService.getProductDetails(req.params.id);
    const { products, categories } = await productService.getAllCatalogProducts();
    res.render('products/index', {
      title: `${product.name} · Product Details`,
      activePage: 'products',
      products,
      categories,
      currentCategory: product.category,
      currentType: 'ALL',
      search: '',
      selectedProduct: product,
    });
  } catch (err) {
    next(err);
  }
});

// Helper to get matching redirectUri based on current incoming request host
function getOAuthRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host = req.get('host') || 'localhost:3000';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocal ? 'http' : (req.headers['x-forwarded-proto'] || req.protocol || 'https');
  return `${protocol}://${host}/oauth2callback`;
}

// Google Drive OAuth2 Authorization Flow (for personal 15GB Gmail accounts)
router.get('/auth/google', (req, res) => {
  try {
    const redirectUri = getOAuthRedirectUri(req);
    const url = googleDriveService.generateAuthUrl(redirectUri);
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Setup Required · Nirmana Printing</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
      </head>
      <body class="bg-light d-flex align-items-center justify-content-center min-vh-100 p-3">
        <div class="card border-0 shadow-sm p-4 text-start" style="max-width: 600px; border-radius: 14px;">
          <h4 class="text-danger fw-bold mb-3"><i class="bi bi-exclamation-triangle-fill me-2"></i>Google OAuth Setup Incomplete</h4>
          <p class="text-secondary">${err.message}</p>
          <div class="alert alert-warning small mb-3">
            Please make sure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (or <code>GOOGLE_CLIENT_SECRET_JSON</code>) are configured in your Vercel Project Settings &gt; Environment Variables.
          </div>
          <div class="d-flex gap-2">
            <a href="/quick-print" class="btn btn-outline-secondary">Back to Quick Print</a>
            <a href="/auth/google" class="btn btn-primary">Try Again</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

router.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Authorization code missing from Google callback.');
  }
  try {
    const redirectUri = getOAuthRedirectUri(req);
    const tokens = await googleDriveService.exchangeCodeForTokens(code, redirectUri);

    // Save refresh token to .env if present (and not read-only)
    if (tokens.refresh_token) {
      process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
      const envPath = path.join(__dirname, '../../.env');
      try {
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
          } else {
            envContent += `\nGOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (e) {
        console.warn('Could not write .env file (expected on Vercel serverless):', e.message);
      }
    }

    // Reset cached client in service so it re-authenticates with new token
    googleDriveService.driveClient = null;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Connected · Nirmana Printing</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
      </head>
      <body class="bg-light d-flex align-items-center justify-content-center min-vh-100 p-3">
        <div class="card border-0 shadow-lg p-4 text-center" style="max-width: 580px; border-radius: 16px;">
          <div class="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle text-success mx-auto mb-3" style="width: 72px; height: 72px;">
            <i class="bi bi-check-circle-fill fs-1"></i>
          </div>
          <h4 class="fw-bold mb-2">Google Drive Connected!</h4>
          <p class="text-secondary small mb-3">
            Your personal Google Drive storage (15 GB) is now connected to Nirmana Printing. All incoming customer print files will be saved straight to your Google Drive folder.
          </p>
          ${tokens.refresh_token ? `
            <div class="alert alert-warning text-start small mb-3 border-0 shadow-sm" style="background-color: #fff8e6;">
              <div class="fw-bold text-dark mb-1"><i class="bi bi-key-fill text-warning me-1"></i> Final Step for Vercel:</div>
              <div class="text-muted mb-2">Copy this <strong>Refresh Token</strong> and add it into your <strong>Vercel Project Settings &gt; Environment Variables</strong> as <code>GOOGLE_REFRESH_TOKEN</code>:</div>
              <div class="input-group">
                <input type="text" id="tokenInput" class="form-control form-control-sm font-monospace bg-white" readonly value="${tokens.refresh_token}" onclick="this.select()">
                <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('tokenInput').value); alert('Token copied to clipboard!');">Copy</button>
              </div>
            </div>
          ` : `
            <div class="alert alert-info text-start small mb-3">
              Google Drive authorized with existing credentials.
            </div>
          `}
          <div class="d-grid gap-2">
            <a href="/quick-print" class="btn btn-primary fw-semibold py-2">Back to Counter Queue</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Failed to exchange code for tokens: ' + err.message);
  }
});

// =========================================================================
// 2. PROTECTED STAFF MANAGEMENT ROUTES (Authentication Required)
// Unauthenticated visitors to any of these routes are redirected to /login
// =========================================================================
router.use(authenticate);

// 1. Dashboard (Staff & Admin Only)
router.get('/dashboard', requireStaff, async (req, res, next) => {
  try {
    const selectedDate = req.query.date || null;
    const stats = await dashboardService.getDashboardStats(selectedDate);
    res.render('dashboard/index', {
      title: 'Dashboard · Nirmana Printing',
      activePage: 'dashboard',
      stats,
      selectedDate: stats.dailyBusiness.date,
    });
  } catch (err) {
    next(err);
  }
});

// 1b. Customer Portal (Personal Orders, Quick Print Submissions, Bills & Balance)
router.get('/portal', async (req, res, next) => {
  try {
    let customerId = req.user.customerId;
    if (!customerId && (req.user.role === 'ADMIN' || req.user.role === 'WORKER' || req.user.role === 'STAFF')) {
      if (req.query.customerId) {
        customerId = parseInt(req.query.customerId, 10);
      } else {
        const anyCust = await customerService.getAllCustomers({ paginate: false });
        if (anyCust && anyCust.length > 0) {
          customerId = anyCust[0].id;
        }
      }
    }

    if (!customerId) {
      return res.redirect('/dashboard');
    }

    const { Order, QuickPrintJob, QuickPrintFile } = require('../models');
    const { Op } = require('sequelize');

    const customer = await customerService.getCustomerById(customerId);

    // Auto-link any previous unlinked orders or quick print jobs created before signup with this phone
    if (customer && customer.phone) {
      await Order.update(
        { customerId: customer.id },
        {
          where: {
            customerId: null,
            notes: { [Op.like]: `%${customer.phone}%` },
          },
        }
      ).catch(() => null);

      await QuickPrintJob.update(
        { customerId: customer.id },
        {
          where: { customerPhone: customer.phone },
        }
      ).catch(() => null);
    }

    // Refresh customer profile after auto-linking
    const freshCustomer = await customerService.getCustomerById(customerId);

    // Fetch all Quick Print jobs for this customer
    const quickPrintJobs = await QuickPrintJob.findAll({
      where: {
        [Op.or]: [
          { customerId: freshCustomer.id },
          ...(freshCustomer.phone ? [{ customerPhone: freshCustomer.phone }] : []),
        ],
      },
      include: [{ model: QuickPrintFile, as: 'files' }],
      order: [['createdAt', 'DESC']],
    });

    const sortedOrders = (freshCustomer.orders || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    freshCustomer.orders = sortedOrders;

    res.render('customerPortal/index', {
      title: `${freshCustomer.name} · Customer Dashboard · Nirmana Printing`,
      activePage: 'portal',
      customer: freshCustomer,
      orders: sortedOrders,
      quickPrintJobs: quickPrintJobs || [],
    });
  } catch (err) {
    next(err);
  }
});

// 2. Orders List
router.get('/orders', requireStaff, async (req, res, next) => {
  try {
    const { status, search, customerId, page, limit } = req.query;
    // Load recent orders across statuses so tabs can filter in-memory instantly
    const { orders, pagination } = await orderService.getAllOrders({
      status: 'ALL',
      search,
      customerId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 100,
      paginate: true,
    });

    let totalBilledVal = 0;
    let totalGivenVal = 0;
    let totalDueVal = 0;
    let completedCount = 0;
    orders.forEach(o => {
      totalBilledVal += parseFloat(o.totalAmount || 0);
      totalGivenVal += parseFloat(o.advancePaid || 0);
      totalDueVal += parseFloat(o.balanceAmount || 0);
      if (o.status === 'COMPLETED') completedCount++;
    });

    res.render('orders/index', {
      title: 'Printing Orders · Nirmana Printing',
      activePage: 'orders',
      orders,
      pagination,
      ordersSummary: {
        totalOrders: orders.length,
        completedCount,
        totalBilled: totalBilledVal,
        totalGiven: totalGivenVal,
        totalDue: totalDueVal,
      },
      currentStatus: status || 'ALL',
      search: search || '',
      customerId: customerId || '',
    });
  } catch (err) {
    next(err);
  }
});

// 3. New Order Form (with inline customer selection / creation)
router.get('/orders/new', requireStaff, async (req, res, next) => {
  try {
    const [customers, stockItems] = await Promise.all([
      customerService.getAllCustomers({ paginate: false }),
      stockService.getAllStockItems({ paginate: false }),
    ]);
    res.render('orders/create', {
      title: 'New Print Order · Nirmana Printing',
      activePage: 'new-order',
      customers,
      stockItems,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Order Detail & Actions
router.get('/orders/:id', requireStaff, async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.render('orders/detail', {
      title: `Order ${order.orderNumber} · Nirmana Printing`,
      activePage: 'orders',
      order,
    });
  } catch (err) {
    next(err);
  }
});

// 4b. Order Printable Bill / Invoice (matches Nirmana Printing official PDF format)
router.get('/orders/:id/invoice', async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    const currencySymbol = config.currencySymbol || 'Rs.';

    let items = [];
    if (order.items && order.items.length > 0) {
      items = order.items.map(i => ({
        description: i.itemDescription || i.productName || 'Printing Service',
        subtext: i.specifications || null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      }));
    } else {
      let subtext = [];
      if (order.paperMaterial) subtext.push(`Material: ${order.paperMaterial}`);
      if (order.specifications) subtext.push(`Specs: ${order.specifications}`);
      const unitPrice = order.quantity > 0 ? (parseFloat(order.totalAmount) / order.quantity) : parseFloat(order.totalAmount);
      items.push({
        description: order.jobTitle || 'Custom Printing Work',
        subtext: subtext.join(' · ') || null,
        quantity: order.quantity || 1,
        unitPrice: unitPrice,
        totalPrice: order.totalAmount,
      });
    }

    const customer = order.customer;
    const billedTo = customer
      ? `${customer.name || customer.fullName || 'Valued Customer'}${customer.phone ? ' - ' + customer.phone : ''}`
      : 'Counter Customer';

    const invoiceData = {
      date: new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB'),
      invoiceNumber: order.orderNumber,
      billedTo: billedTo,
      items: items,
      totalAmount: order.totalAmount,
      advancePaid: order.advancePaid,
      balanceAmount: order.balanceAmount,
      currencySymbol: currencySymbol,
    };

    res.render('invoices/billPrint', {
      title: `Invoice #${order.orderNumber} · Nirmana Printing`,
      invoiceData,
    });
  } catch (err) {
    next(err);
  }
});

// 5. Stock Management (Live Inventory, Stock In/Out, Stock Removal, Office Use, History)
router.get('/stock', requireStaff, async (req, res, next) => {
  try {
    const { search, category, page, txPage, usagePage, officePage, usageCategory, removedPage, removedReason, tab } = req.query;
    const [
      stockResult,
      { transactions, pagination: transactionsPagination },
      usageResult,
      removedResult,
      allItems
    ] = await Promise.all([
      stockService.getAllStockItems({
        search,
        category,
        page: parseInt(page, 10) || 1,
        limit: 10,
        paginate: true,
      }),
      stockService.getRecentTransactions({
        page: parseInt(txPage, 10) || 1,
        limit: 10,
        paginate: true,
      }),
      stockService.getUsageTransactions({
        page: parseInt(usagePage || officePage, 10) || 1,
        limit: 10,
        category: usageCategory || null,
        paginate: true,
      }),
      stockService.getRemovedStockTransactions({
        page: parseInt(removedPage, 10) || 1,
        limit: 10,
        reason: removedReason || null,
        paginate: true,
      }),
      stockService.getAllStockItems({ paginate: false }),
    ]);

    const items = stockResult.items || [];
    const itemsPagination = stockResult.pagination || null;
    const inventorySummary = stockResult.inventorySummary || {
      totalItems: items.length,
      totalRemainingValuation: 0,
      totalUsageValue: 0,
      totalJobStockValue: 0,
      totalOfficeUseValue: 0,
    };
    const usageTransactions = usageResult.transactions || [];
    const usagePagination = usageResult.pagination || null;
    const removedTransactions = removedResult.transactions || [];
    const removedPagination = removedResult.pagination || null;
    const removedSummary = removedResult.summary || { totalCount: 0, totalQuantity: 0, totalLossValue: 0 };

    // Extract unique categories for filter
    const categories = [...new Set(allItems.map(i => i.category))];

    res.render('stock/index', {
      title: 'Stock Management · Nirmana Printing',
      activePage: 'stock',
      items,
      itemsPagination,
      inventorySummary,
      transactions,
      transactionsPagination,
      usageTransactions,
      usagePagination,
      officeTransactions: usageTransactions, // for backward compatibility
      officePagination: usagePagination,
      removedTransactions,
      removedPagination,
      removedSummary,
      categories,
      currentCategory: category || 'ALL',
      search: search || '',
      currentPage: parseInt(page, 10) || 1,
      currentTxPage: parseInt(txPage, 10) || 1,
      currentUsagePage: parseInt(usagePage || officePage, 10) || 1,
      currentUsageCategory: usageCategory || 'ALL',
      currentRemovedPage: parseInt(removedPage, 10) || 1,
      currentRemovedReason: removedReason || 'ALL',
      currentTab: tab || 'inventory',
    });
  } catch (err) {
    next(err);
  }
});

// 5c. Record Stock Removal (View Form Submission)
router.post('/stock/remove', requireStaff, async (req, res, next) => {
  try {
    const { stockItemId, quantity, reason, reference, notes, date } = req.body;
    await stockService.recordStockRemoval({
      stockItemId: parseInt(stockItemId, 10),
      quantity: parseFloat(quantity),
      reason,
      reference,
      notes,
      date,
    });
    res.redirect('/stock?tab=removed');
  } catch (err) {
    next(err);
  }
});

// 5d. Delete / Archive Stock Item (View Form Submission)
router.post('/stock/delete/:id', requireStaff, async (req, res, next) => {
  try {
    await stockService.deleteStockItem(req.params.id);
    res.redirect('/stock?tab=inventory');
  } catch (err) {
    next(err);
  }
});

// 5b. Stock Item Details Page
router.get('/stock/:id', requireStaff, async (req, res, next) => {
  try {
    const item = await stockService.getStockItemById(req.params.id);
    const profit = item.getProfitInfo();
    const statusObj = item.getStockStatus();
    res.render('stock/detail', {
      title: `${item.name} · Stock Details`,
      activePage: 'stock',
      item,
      profit,
      statusObj,
    });
  } catch (err) {
    next(err);
  }
});

// 6. Customers Directory
router.get('/customers', requireStaff, async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const { customers, pagination, accountsSummary } = await customerService.getAllCustomers({
      search,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      paginate: true,
    });
    res.render('customers/index', {
      title: 'Customer Directory · Nirmana Printing',
      activePage: 'customers',
      customers,
      pagination,
      accountsSummary,
      search: search || '',
    });
  } catch (err) {
    next(err);
  }
});

// 6b. Customer Profile & Order History Details Page
router.get('/customers/:id', requireStaff, async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    res.render('customers/detail', {
      title: `${customer.name} · Customer Profile`,
      activePage: 'customers',
      customer,
    });
  } catch (err) {
    next(err);
  }
});

// 7. Shopkeeper Quick Print Counter Queue & Print Management
router.get('/quick-print', requireStaff, async (req, res, next) => {
  try {
    const status = req.query.status || 'PENDING';
    const search = req.query.search || '';
    // Fetch all active jobs so both Pending and Completed tabs are instant in-memory
    const [jobs, stats] = await Promise.all([
      quickPrintService.getAllJobs({ status: 'ALL', search }),
      quickPrintService.getQueueStats(),
    ]);

    const defaultUploadUrl = getUploadUrl(req);
    const availableIps = getAvailableLanIps();

    let defaultQrDataUrl = '';
    try {
      defaultQrDataUrl = await QRCode.toDataURL(defaultUploadUrl, {
        width: 480,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });
    } catch (qrErr) {
      console.error('Failed to pre-render QR code in viewRoutes:', qrErr.message);
    }

    res.render('quickPrint/index', {
      title: 'Quick Print Counter Queue · Nirmana Printing',
      activePage: 'quick-print',
      jobs,
      stats,
      currentStatus: status,
      search,
      defaultUploadUrl,
      defaultQrDataUrl,
      availableIps,
    });
  } catch (err) {
    next(err);
  }
});

// 8. Point of Sale (POS) Counter Checkout & Sales Ledger
router.get('/pos', requireStaff, async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo, paymentMethod, page } = req.query;

    const [stockItems, todayStats, salesResult] = await Promise.all([
      stockService.getAllStockItems(),
      posService.getDailyStats(),
      posService.getAllSales({
        search: search || '',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        paymentMethod: paymentMethod || 'ALL',
        page: parseInt(page, 10) || 1,
        limit: 15,
        paginate: true,
      }),
    ]);

    res.render('pos/index', {
      title: 'Point of Sale (POS) · Nirmana Printing',
      activePage: 'pos',
      stockItems,
      todayStats,
      sales: salesResult.sales,
      pagination: salesResult.pagination,
      search: search || '',
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      paymentMethod: paymentMethod || 'ALL',
    });
  } catch (err) {
    next(err);
  }
});

// 8b. POS Sale Printable Bill / Invoice (matches Nirmana Printing official PDF format)
router.get('/pos/sales/:id/invoice', requireStaff, async (req, res, next) => {
  try {
    const sale = await posService.getSaleById(req.params.id);
    const currencySymbol = config.currencySymbol || 'Rs.';

    const items = (sale.items || []).map(i => ({
      description: i.itemName,
      subtext: null,
      quantity: parseFloat(i.quantity),
      unitPrice: parseFloat(i.unitPrice),
      totalPrice: parseFloat(i.totalPrice),
    }));

    const invoiceData = {
      date: new Date(sale.createdAt || sale.saleDate).toLocaleDateString('en-GB'),
      invoiceNumber: sale.receiptNumber,
      billedTo: sale.customerName || (sale.customer ? (sale.customer.name || sale.customer.fullName) : 'Counter Walk-in Customer'),
      items: items,
      totalAmount: sale.finalAmount || sale.totalAmount,
      advancePaid: undefined,
      balanceAmount: undefined,
      currencySymbol: currencySymbol,
    };

    res.render('invoices/billPrint', {
      title: `Invoice #${sale.receiptNumber} · Nirmana Printing`,
      invoiceData,
    });
  } catch (err) {
    next(err);
  }
});

// 9. User Administration (Admin Only)
router.get('/users', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { User } = require('../models');
    const users = await User.findAll({ order: [['fullName', 'ASC']] });
    res.render('users/index', {
      title: 'User Administration · Nirmana Printing',
      activePage: 'users',
      users,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
