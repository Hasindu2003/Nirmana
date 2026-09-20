const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');
const stockController = require('../controllers/stockController');
const customerController = require('../controllers/customerController');
const dashboardController = require('../controllers/dashboardController');
const quickPrintController = require('../controllers/quickPrintController');
const { uploadQuickPrint } = require('../middleware/upload');

// 1. Auth
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.getMe);

// 2. Dashboard
router.get('/dashboard/stats', dashboardController.getStats);

// 3. Stock Management (Simple Stock In / Stock Out)
router.get('/stock', stockController.listItems);
router.post('/stock', stockController.createItem);
router.post('/stock/in', stockController.recordStockIn);       // New stock arrived
router.post('/stock/out', stockController.recordStockOut);     // Stock taken out to use
router.get('/stock/transactions', stockController.listTransactions); // Movement history

// 4. Orders (with automatic customer creation)
router.get('/orders', orderController.listOrders);
router.post('/orders', orderController.createOrder);          // Auto-creates customer if new
router.get('/orders/:id', orderController.getOrder);
router.put('/orders/:id/status', orderController.updateStatus);
router.post('/orders/:id/payment', orderController.recordPayment);

// 5. Customers
router.get('/customers', customerController.listCustomers);
router.post('/customers', customerController.createCustomer);
router.get('/customers/:id', customerController.getCustomer);

// 6. Walk-in Customer Quick Print (QR Scan / Counter Queue)
router.post('/quick-print/upload', uploadQuickPrint, quickPrintController.submitUpload);
router.get('/quick-print/status/:id', quickPrintController.getJobStatus);
router.get('/quick-print/jobs', quickPrintController.listJobs);
router.put('/quick-print/jobs/:id/status', quickPrintController.updateStatus);
router.delete('/quick-print/jobs/:id', quickPrintController.deleteJob);
router.post('/quick-print/jobs/:id/convert', quickPrintController.convertToOrder);
router.get('/quick-print/qr', quickPrintController.generateQrCode);
router.get('/quick-print/stats', quickPrintController.getStats);

module.exports = router;

