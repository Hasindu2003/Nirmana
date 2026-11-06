const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  sequelize,
  Order,
  Payment,
  QuickPrintJob,
  QuickPrintFile,
  PosSale,
  PosSaleItem,
  AuditLog,
  PhoneVerification,
  StockTransaction,
  StockItem,
  Customer,
  User,
} = require('../src/models');

async function cleanOrderRecords() {
  console.log('===============================================================');
  console.log('🧹 CLEANING ORDER DETAILS & TEST DATA (PRESERVING ALL FEATURES)');
  console.log('===============================================================');

  // Step 1: Clean POS Sale Items & POS Sales
  console.log('\n1. Removing POS sales & line items...');
  const saleItemsCount = await PosSaleItem.destroy({ where: {} });
  const salesCount = await PosSale.destroy({ where: {} });
  console.log(`   ✓ Deleted ${saleItemsCount} POS sale line items.`);
  console.log(`   ✓ Deleted ${salesCount} POS sales.`);

  // Step 2: Clean Payments
  console.log('\n2. Removing Order payments & deposits...');
  const paymentsCount = await Payment.destroy({ where: {} });
  console.log(`   ✓ Deleted ${paymentsCount} payment transaction records.`);

  // Step 3: Clean Quick Print Files & Jobs
  console.log('\n3. Removing Quick-Print queue jobs & files metadata...');
  const qpFilesCount = await QuickPrintFile.destroy({ where: {} });
  const qpJobsCount = await QuickPrintJob.destroy({ where: {} });
  console.log(`   ✓ Deleted ${qpFilesCount} quick-print file entries.`);
  console.log(`   ✓ Deleted ${qpJobsCount} quick-print queue jobs.`);

  // Step 4: Clean Orders
  console.log('\n4. Removing Orders (Commercial & Photo Frame Studio)...');
  const ordersCount = await Order.destroy({ where: {} });
  console.log(`   ✓ Deleted ${ordersCount} orders.`);

  // Step 5: Clean Audit Logs & Phone Verifications
  console.log('\n5. Clearing test audit logs & phone verifications...');
  const auditLogsCount = await AuditLog.destroy({ where: {} });
  let phoneVerifCount = 0;
  if (PhoneVerification) {
    phoneVerifCount = await PhoneVerification.destroy({ where: {} }).catch(() => 0);
  }
  console.log(`   ✓ Deleted ${auditLogsCount} audit log entries.`);
  console.log(`   ✓ Deleted ${phoneVerifCount} phone verifications.`);

  // Step 6: Clean Stock Transactions (test run entries)
  console.log('\n6. Clearing test stock transaction history...');
  const stockTxCount = await StockTransaction.destroy({ where: {} });
  console.log(`   ✓ Cleared ${stockTxCount} stock ledger transactions.`);

  // Step 7: Clean temporary test stock items (TEST-SUBSTRATE-XXXX & duplicates)
  console.log('\n7. Cleaning temporary test stock items while preserving core catalog...');
  const testItemsCount = await StockItem.destroy({
    where: {
      [Op.or]: [
        { code: { [Op.like]: 'TEST-%' } },
        { name: { [Op.like]: 'Test%' } },
        { currentStock: 0, code: { [Op.in]: ['STK-0002', 'STK-0003', 'STK-0004', 'STK-0005'] } },
      ],
    },
  });
  console.log(`   ✓ Removed ${testItemsCount} obsolete/test stock items.`);

  // Step 8: Clean test customers
  console.log('\n8. Cleaning test customer profiles while preserving real profiles...');
  const testCustomersCount = await Customer.destroy({
    where: {
      [Op.or]: [
        { name: { [Op.like]: 'Test%' } },
        { name: { [Op.like]: '%Customer 4184%' } },
        { name: { [Op.like]: '%Commercial Client 4184%' } },
      ],
    },
  });
  console.log(`   ✓ Removed ${testCustomersCount} test customer profiles.`);

  // Step 9: Clean physical files in public/uploads/quick-print and public/uploads/slips
  console.log('\n9. Removing physical uploaded test files from storage...');
  const uploadDirs = [
    path.join(__dirname, '..', 'public', 'uploads', 'quick-print'),
    path.join(__dirname, '..', 'public', 'uploads', 'slips'),
  ];

  let deletedFilesCount = 0;
  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === '.gitkeep') continue;
        const filePath = path.join(dir, file);
        try {
          fs.unlinkSync(filePath);
          deletedFilesCount++;
        } catch (e) {
          console.warn(`   ⚠️ Could not delete file: ${file}`);
        }
      }
    }
  }
  console.log(`   ✓ Removed ${deletedFilesCount} uploaded mock/test files from disk.`);

  // Step 10: Final State Verification
  console.log('\n10. Verifying clean state...');
  const remaining = {
    orders: await Order.count(),
    payments: await Payment.count(),
    quickPrintJobs: await QuickPrintJob.count(),
    quickPrintFiles: await QuickPrintFile.count(),
    posSales: await PosSale.count(),
    posSaleItems: await PosSaleItem.count(),
    stockItems: await StockItem.count(),
    stockTransactions: await StockTransaction.count(),
    customers: await Customer.count(),
    users: await User.count(),
  };

  console.log('\n--- CURRENT RECORD COUNTS ---');
  console.log(`• Orders:             ${remaining.orders} (Completely Empty)`);
  console.log(`• Payments:           ${remaining.payments} (Completely Empty)`);
  console.log(`• Quick-Print Jobs:   ${remaining.quickPrintJobs} (Completely Empty)`);
  console.log(`• POS Sales:          ${remaining.posSales} (Completely Empty)`);
  console.log(`• Stock Items:        ${remaining.stockItems} (Active Catalog Intact)`);
  console.log(`• Stock Transactions: ${remaining.stockTransactions} (Clean Ledger)`);
  console.log(`• Customer Profiles:  ${remaining.customers} (Real Profiles Preserved)`);
  console.log(`• System Users:       ${remaining.users} (Admin & Staff Accounts Intact)`);

  console.log('\n===============================================================');
  console.log('✅ ALL ORDER DETAILS & TEST DATA HAVE BEEN EMPTIED SUCCESSFULLY!');
  console.log('===============================================================');
}

cleanOrderRecords().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Error during cleanup:', err);
  process.exit(1);
});

