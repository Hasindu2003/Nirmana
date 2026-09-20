const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const dashboardService = require('../services/dashboardService');
const orderService = require('../services/orderService');
const stockService = require('../services/stockService');
const customerService = require('../services/customerService');
const { authenticate } = require('../middleware/auth');

// Root redirect
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/dashboard'); // Allow easy direct access to dashboard
});

// Login
router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Sign In · Nirmana Printing',
    error: null,
    username: '',
    activePage: 'login',
  });
});

router.post('/login', authController.login);
router.get('/logout', authController.logout);

// 1. Dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    res.render('dashboard/index', {
      title: 'Dashboard · Nirmana Printing',
      activePage: 'dashboard',
      stats,
    });
  } catch (err) {
    next(err);
  }
});

// 2. Orders List
router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, customerId, page, limit } = req.query;
    const { orders, pagination } = await orderService.getAllOrders({
      status,
      search,
      customerId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      paginate: true,
    });
    res.render('orders/index', {
      title: 'Printing Orders · Nirmana Printing',
      activePage: 'orders',
      orders,
      pagination,
      currentStatus: status || 'ALL',
      search: search || '',
      customerId: customerId || '',
    });
  } catch (err) {
    next(err);
  }
});

// 3. New Order Form (with inline customer selection / creation)
router.get('/orders/new', async (req, res, next) => {
  try {
    const customers = await customerService.getAllCustomers({ paginate: false });
    const stockItems = await stockService.getAllStockItems({ paginate: false });
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
router.get('/orders/:id', async (req, res, next) => {
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

// 5. Stock Management (Live Inventory, Stock In/Out, History)
router.get('/stock', async (req, res, next) => {
  try {
    const { search, category, page, txPage } = req.query;
    const { items, pagination: itemsPagination } = await stockService.getAllStockItems({
      search,
      category,
      page: parseInt(page, 10) || 1,
      limit: 10,
      paginate: true,
    });

    const { transactions, pagination: transactionsPagination } = await stockService.getRecentTransactions({
      page: parseInt(txPage, 10) || 1,
      limit: 10,
      paginate: true,
    });

    // Extract unique categories for filter
    const allItems = await stockService.getAllStockItems({ paginate: false });
    const categories = [...new Set(allItems.map(i => i.category))];

    res.render('stock/index', {
      title: 'Stock Management · Nirmana Printing',
      activePage: 'stock',
      items,
      itemsPagination,
      transactions,
      transactionsPagination,
      categories,
      currentCategory: category || 'ALL',
      search: search || '',
      currentPage: parseInt(page, 10) || 1,
      currentTxPage: parseInt(txPage, 10) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// 5b. Stock Item Details Page
router.get('/stock/:id', async (req, res, next) => {
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

const quickPrintService = require('../services/quickPrintService');

// 6. Customers Directory
router.get('/customers', async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const { customers, pagination } = await customerService.getAllCustomers({
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
      search: search || '',
    });
  } catch (err) {
    next(err);
  }
});

// 6b. Customer Profile & Order History Details Page
router.get('/customers/:id', async (req, res, next) => {
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

// 7. Walk-in Customer Self-Service Upload (Mobile QR Destination)
router.get(['/upload', '/quick-print/upload'], (req, res) => {
  const defaultUploadUrl = `${req.protocol}://${req.get('host')}/upload`;
  res.render('quickPrint/upload', {
    title: 'Self-Service Print Station · Nirmana Printing',
    activePage: 'guest-upload',
    uploadUrl: defaultUploadUrl,
  });
});

const { getUploadUrl, getAvailableLanIps } = require('../utils/network');

// 8. Shopkeeper Quick Print Counter Queue & Print Management
router.get('/quick-print', async (req, res, next) => {
  try {
    const status = req.query.status || 'PENDING';
    const search = req.query.search || '';
    const [jobs, stats] = await Promise.all([
      quickPrintService.getAllJobs({ status, search }),
      quickPrintService.getQueueStats(),
    ]);

    const defaultUploadUrl = getUploadUrl(req);
    const availableIps = getAvailableLanIps();

    res.render('quickPrint/index', {
      title: 'Quick Print Counter Queue · Nirmana Printing',
      activePage: 'quick-print',
      jobs,
      stats,
      currentStatus: status,
      search,
      defaultUploadUrl,
      availableIps,
    });
  } catch (err) {
    next(err);
  }
});

// Google Drive OAuth2 Authorization Flow (for personal 15GB Gmail accounts)
const googleDriveService = require('../services/googleDriveService');
const fs = require('fs');
const path = require('path');

router.get('/auth/google', (req, res) => {
  try {
    const url = googleDriveService.generateAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send('Error generating Google authorization link: ' + err.message);
  }
});

router.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Authorization code missing from Google callback.');
  }
  try {
    const tokens = await googleDriveService.exchangeCodeForTokens(code);

    // Save refresh token to .env if present
    if (tokens.refresh_token) {
      process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
      const envPath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
          envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
        } else {
          envContent += `\nGOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
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
        <div class="card border-0 shadow-lg p-4 text-center" style="max-width: 520px; border-radius: 16px;">
          <div class="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle text-success mx-auto mb-3" style="width: 72px; height: 72px;">
            <i class="bi bi-check-circle-fill fs-1"></i>
          </div>
          <h4 class="fw-bold mb-2">Google Drive Connected!</h4>
          <p class="text-secondary small mb-3">
            Your personal Google Drive storage (15 GB) is now connected to Nirmana Printing. All incoming customer print files will be saved straight to your Google Drive folder.
          </p>
          ${tokens.refresh_token ? `
            <div class="alert alert-info text-start small mb-3">
              <strong>Vercel Production Note:</strong><br>
              Copy this token into your Vercel Project Settings > Environment Variables:
              <input type="text" class="form-control form-control-sm font-monospace mt-2" readonly value="${tokens.refresh_token}" onclick="this.select()">
            </div>
          ` : ''}
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

module.exports = router;


