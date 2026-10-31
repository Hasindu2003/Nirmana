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
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireRole, requireStaff } = require('../middleware/rbac');

// =========================================================================
// 1. PUBLIC ROUTES (Accessible by customers and pre-login staff)
// =========================================================================
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);
router.post('/auth/send-otp', authController.sendOtp);
router.post('/auth/verify-otp', authController.verifyOtp);

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

// Public Online Order Intake (Signed up customer or guest with WhatsApp number)
router.post('/orders/online-guest', optionalAuthenticate, orderController.createGuestOnlineOrder);

// =========================================================================
// 2. PROTECTED STAFF ROUTES (Require active session or Bearer token + Staff Role)
// =========================================================================
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);

// Dashboard (Staff only)
router.get('/dashboard/stats', authenticate, requireStaff, dashboardController.getStats);

// Stock Management (Staff only)
router.get('/stock', authenticate, requireStaff, stockController.listItems);
router.post('/stock', authenticate, requireStaff, stockController.createItem);
router.post('/stock/in', authenticate, requireStaff, stockController.recordStockIn);
router.post('/stock/out', authenticate, requireStaff, stockController.recordStockOut);
router.post('/stock/office-use', authenticate, requireStaff, stockController.recordOfficeUse);
router.get('/stock/office-use', authenticate, requireStaff, stockController.listOfficeUse);
router.get('/stock/transactions', authenticate, requireStaff, stockController.listTransactions);

// Printing Orders (Staff only)
router.get('/orders', authenticate, requireStaff, orderController.listOrders);
router.post('/orders', authenticate, requireStaff, orderController.createOrder);
router.get('/orders/:id', authenticate, requireStaff, orderController.getOrder);
router.put('/orders/:id/status', authenticate, requireStaff, orderController.updateStatus);
router.post('/orders/:id/payment', authenticate, requireStaff, orderController.recordPayment);
router.put('/orders/:id/discount', authenticate, requireStaff, orderController.updateDiscount);

// Customers (Staff only)
router.get('/customers', authenticate, requireStaff, customerController.listCustomers);
router.post('/customers', authenticate, requireStaff, customerController.createCustomer);
router.get('/customers/:id', authenticate, requireStaff, customerController.getCustomer);

// Quick Print Counter Queue (Shopkeeper Operations)
router.get('/quick-print/jobs', authenticate, requireStaff, quickPrintController.listJobs);
router.put('/quick-print/jobs/:id/status', authenticate, requireStaff, quickPrintController.updateStatus);
router.delete('/quick-print/jobs/:id', authenticate, requireStaff, quickPrintController.deleteJob);
router.post('/quick-print/jobs/batch-delete', authenticate, requireStaff, quickPrintController.batchDeleteJobs);
router.post('/quick-print/jobs/:id/convert', authenticate, requireStaff, quickPrintController.convertToOrder);
router.get('/quick-print/stats', authenticate, requireStaff, quickPrintController.getStats);
router.get('/quick-print/files/:fileId/view', authenticate, requireStaff, quickPrintController.viewFile);
router.get('/quick-print/files/:fileId/download', authenticate, requireStaff, quickPrintController.downloadFile);

// Point of Sale (POS) Counter Operations
router.get('/pos/sales', authenticate, requireStaff, posController.listSales);
router.post('/pos/sales', authenticate, requireStaff, posController.createSale);
router.post('/pos/quick-transaction', authenticate, requireStaff, posController.createQuickTransaction);
router.get('/pos/sales/:id', authenticate, requireStaff, posController.getSale);
router.post('/pos/sales/:id/void', authenticate, requireStaff, posController.voidSale);
router.get('/pos/stats', authenticate, requireStaff, posController.getStats);

// =========================================================================
// 3. ADMIN-ONLY USER & ROLE ADMINISTRATION (Shop Employees)
// =========================================================================
router.get('/users', authenticate, requireRole('ADMIN'), userController.listUsers);
router.post('/users', authenticate, requireRole('ADMIN'), userController.createUser);
router.put('/users/:id', authenticate, requireRole('ADMIN'), userController.updateUser);
router.put('/users/:id/toggle-status', authenticate, requireRole('ADMIN'), userController.toggleStatus);
router.put('/users/:id/reset-password', authenticate, requireRole('ADMIN'), userController.resetPassword);

module.exports = router;

