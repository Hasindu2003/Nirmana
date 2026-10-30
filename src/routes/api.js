const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const orderController = require('../controllers/orderController');
const stockController = require('../controllers/stockController');
const customerController = require('../controllers/customerController');
const dashboardController = require('../controllers/dashboardController');
const quickPrintController = require('../controllers/quickPrintController');
const posController = require('../controllers/posController');
const productController = require('../controllers/productController');
const { uploadQuickPrint } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// =========================================================================
// 1. PUBLIC ROUTES (Accessible by customers and pre-login staff)
// =========================================================================
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);

// Customer walk-in upload & token tracking
router.post('/quick-print/upload', uploadQuickPrint, quickPrintController.submitUpload);
router.post('/quick-print/init-direct-upload', quickPrintController.initDirectUpload);
router.post('/quick-print/complete-direct-upload', quickPrintController.completeDirectUpload);
router.put('/quick-print/upload-chunk', quickPrintController.proxyUploadChunk);
router.get('/quick-print/status/:id', quickPrintController.getJobStatus);
router.get('/quick-print/qr', quickPrintController.generateQrCode);
router.get('/quick-print/storage-status', quickPrintController.getStorageStatus);

// Public Products & Services Catalog
router.get('/products', productController.listProducts);
router.get('/products/:id', productController.getProduct);

// =========================================================================
// 2. PROTECTED STAFF ROUTES (Require active session or Bearer token)
// =========================================================================
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);

// Dashboard
router.get('/dashboard/stats', authenticate, dashboardController.getStats);

// Stock Management
router.get('/stock', authenticate, stockController.listItems);
router.post('/stock', authenticate, stockController.createItem);
router.post('/stock/in', authenticate, stockController.recordStockIn);
router.post('/stock/out', authenticate, stockController.recordStockOut);
router.post('/stock/office-use', authenticate, stockController.recordOfficeUse);
router.get('/stock/office-use', authenticate, stockController.listOfficeUse);
router.get('/stock/transactions', authenticate, stockController.listTransactions);

// Printing Orders
router.get('/orders', authenticate, orderController.listOrders);
router.post('/orders', authenticate, orderController.createOrder);
router.get('/orders/:id', authenticate, orderController.getOrder);
router.put('/orders/:id/status', authenticate, orderController.updateStatus);
router.post('/orders/:id/payment', authenticate, orderController.recordPayment);
router.put('/orders/:id/discount', authenticate, orderController.updateDiscount);

// Customers
router.get('/customers', authenticate, customerController.listCustomers);
router.post('/customers', authenticate, customerController.createCustomer);
router.get('/customers/:id', authenticate, customerController.getCustomer);

// Quick Print Counter Queue (Shopkeeper Operations)
router.get('/quick-print/jobs', authenticate, quickPrintController.listJobs);
router.put('/quick-print/jobs/:id/status', authenticate, quickPrintController.updateStatus);
router.delete('/quick-print/jobs/:id', authenticate, quickPrintController.deleteJob);
router.post('/quick-print/jobs/batch-delete', authenticate, quickPrintController.batchDeleteJobs);
router.post('/quick-print/jobs/:id/convert', authenticate, quickPrintController.convertToOrder);
router.get('/quick-print/stats', authenticate, quickPrintController.getStats);
router.get('/quick-print/files/:fileId/view', authenticate, quickPrintController.viewFile);
router.get('/quick-print/files/:fileId/download', authenticate, quickPrintController.downloadFile);

// Point of Sale (POS) Counter Operations
router.get('/pos/sales', authenticate, posController.listSales);
router.post('/pos/sales', authenticate, posController.createSale);
router.post('/pos/quick-transaction', authenticate, posController.createQuickTransaction);
router.get('/pos/sales/:id', authenticate, posController.getSale);
router.post('/pos/sales/:id/void', authenticate, posController.voidSale);
router.get('/pos/stats', authenticate, posController.getStats);

// =========================================================================
// 3. ADMIN-ONLY USER & ROLE ADMINISTRATION (Shop Employees)
// =========================================================================
router.get('/users', authenticate, requireRole('ADMIN'), userController.listUsers);
router.post('/users', authenticate, requireRole('ADMIN'), userController.createUser);
router.put('/users/:id', authenticate, requireRole('ADMIN'), userController.updateUser);
router.put('/users/:id/toggle-status', authenticate, requireRole('ADMIN'), userController.toggleStatus);
router.put('/users/:id/reset-password', authenticate, requireRole('ADMIN'), userController.resetPassword);

module.exports = router;

