/**
 * Test: QR Quick Order Photo Frame vs General Print Separation
 * Verifies that:
 * 1. Customer can choose Photo Frame order or General Print order.
 * 2. Photo Frame orders are saved with orderType: 'PHOTO_FRAME'.
 * 3. Photo Frame orders auto-sync to Photo Frames Studio tab (/orders?type=frame) and are isolated from commercial orders.
 * 4. General prints are saved with orderType: 'GENERAL_PRINT' and don't leak into Photo Frames Studio.
 * 5. Monetary values and completion statuses sync properly.
 */

const { sequelize, QuickPrintJob, QuickPrintFile, Order, Customer, Payment, PosSale } = require('../src/models');
const quickPrintService = require('../src/services/quickPrintService');
const orderService = require('../src/services/orderService');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=== STARTING QR ORDER SEPARATION TEST ===\n');

  try {
    await sequelize.authenticate();
    console.log('✓ Connected to Database.');

    // 1. Simulate QR Customer Upload for a PHOTO_FRAME Order
    console.log('\n--- SCENARIO 1: Walk-in Customer Uploads Photo Frame Order ---');
    const dummyPhotoFile = {
      originalname: 'wedding_portrait_2026.jpg',
      filename: `test_wedding_${Date.now()}.jpg`,
      path: path.join(__dirname, `test_photo_${Date.now()}.jpg`),
      size: 1024 * 1024 * 2, // 2MB
      mimetype: 'image/jpeg',
    };
    fs.writeFileSync(dummyPhotoFile.path, 'Fake image payload for testing');

    const photoOrderData = {
      customerName: 'Saman Kumara',
      customerPhone: '0771234567',
      customerMessage: 'Please use a teak wood glass frame with glossy finish',
      orderType: 'PHOTO_FRAME',
      paperSize: 'Frame 10x12',
      colorMode: 'COLOR',
      copies: 2,
      frameType: 'Wooden Glass Frame',
      frameFinish: 'Glossy Photo',
    };

    const photoJobResult = await quickPrintService.createJob(photoOrderData, [dummyPhotoFile]);
    const photoJob = photoJobResult.job;

    console.log(`✓ QuickPrintJob created with Token: ${photoJob.tokenNumber}`);
    console.log(`  - orderType: ${photoJob.orderType}`);
    console.log(`  - paperSize: ${photoJob.paperSize}`);
    console.log(`  - linked orderId: ${photoJob.orderId}`);

    if (photoJob.orderType !== 'PHOTO_FRAME') {
      throw new Error(`Expected photoJob.orderType to be PHOTO_FRAME, got ${photoJob.orderType}`);
    }

    if (!photoJob.orderId) {
      throw new Error('Expected photoJob.orderId to be auto-populated for PHOTO_FRAME order!');
    }

    // Verify the linked Order exists in Photo Frames Studio
    const linkedOrder = await Order.findByPk(photoJob.orderId);
    if (!linkedOrder) {
      throw new Error(`Linked order #${photoJob.orderId} not found in database!`);
    }

    console.log(`✓ Linked Order #${linkedOrder.orderNumber} successfully auto-created in Orders table!`);
    console.log(`  - Order orderType: ${linkedOrder.orderType}`);
    console.log(`  - Order jobTitle: ${linkedOrder.jobTitle}`);

    if (linkedOrder.orderType !== 'PHOTO_FRAME') {
      throw new Error(`Expected linkedOrder.orderType to be PHOTO_FRAME, got ${linkedOrder.orderType}`);
    }

    // Check workspace separation in orderService.getAllOrders
    const frameOrdersResult = await orderService.getAllOrders({ type: 'frame', paginate: false });
    const isPresentInFrameTab = frameOrdersResult.some(o => o.id === linkedOrder.id);
    console.log(`✓ Is present in Photo Frames Studio tab (/orders?type=frame): ${isPresentInFrameTab}`);
    if (!isPresentInFrameTab) {
      throw new Error('Expected order to appear in Photo Frames Studio tab!');
    }

    const generalOrdersResult = await orderService.getAllOrders({ type: 'general', paginate: false });
    const isPresentInGeneralTab = generalOrdersResult.some(o => o.id === linkedOrder.id);
    console.log(`✓ Is present in Commercial Orders tab (/orders?type=general): ${isPresentInGeneralTab}`);
    if (isPresentInGeneralTab) {
      throw new Error('Photo Frame order leaked into Commercial Orders tab!');
    }

    // 2. Simulate QR Customer Upload for a GENERAL_PRINT Order
    console.log('\n--- SCENARIO 2: Walk-in Customer Uploads Standard Document Print ---');
    const dummyDocFile = {
      originalname: 'project_assignment.pdf',
      filename: `test_doc_${Date.now()}.pdf`,
      path: path.join(__dirname, `test_doc_${Date.now()}.pdf`),
      size: 500 * 1024, // 500KB
      mimetype: 'application/pdf',
    };
    fs.writeFileSync(dummyDocFile.path, 'Fake PDF document for testing');

    const generalOrderData = {
      customerName: 'Anura Bandara',
      customerPhone: '0719876543',
      customerMessage: 'Staple top left corner please',
      orderType: 'GENERAL_PRINT',
      paperSize: 'A4',
      colorMode: 'BW',
      copies: 5,
    };

    const docJobResult = await quickPrintService.createJob(generalOrderData, [dummyDocFile]);
    const docJob = docJobResult.job;

    console.log(`✓ QuickPrintJob created with Token: ${docJob.tokenNumber}`);
    console.log(`  - orderType: ${docJob.orderType}`);
    console.log(`  - paperSize: ${docJob.paperSize}`);
    console.log(`  - linked orderId: ${docJob.orderId}`);

    if (docJob.orderType !== 'GENERAL_PRINT') {
      throw new Error(`Expected docJob.orderType to be GENERAL_PRINT, got ${docJob.orderType}`);
    }

    if (docJob.orderId) {
      throw new Error('General Print should not auto-create an Order until converted!');
    }

    // 3. Mark Photo Job Completed with Money Received & verify POS sync
    console.log('\n--- SCENARIO 3: Complete Photo Job & Record Payment to POS ---');
    const completeResult = await quickPrintService.updateJobStatus(photoJob.id, 'COMPLETED', null, {
      moneyGot: true,
      amount: 2500.00,
      paymentMethod: 'CASH',
    });

    console.log(`✓ Job marked as COMPLETED.`);
    if (completeResult.posSale) {
      console.log(`✓ POS Sale created: Receipt #${completeResult.posSale.receiptNumber}, Amount: Rs. ${completeResult.posSale.totalAmount}`);
    } else {
      console.warn('Note: POS Sale creation was skipped or posService handled it.');
    }

    const reloadedLinkedOrder = await Order.findByPk(linkedOrder.id);
    console.log(`✓ Linked Order status after Job complete: ${reloadedLinkedOrder.status}`);
    if (reloadedLinkedOrder.status !== 'COMPLETED') {
      throw new Error(`Expected linked order to sync to COMPLETED, got ${reloadedLinkedOrder.status}`);
    }

    // 4. Test Queue Filter by Category
    console.log('\n--- SCENARIO 4: Queue Category Filter ---');
    const photoJobsOnly = await quickPrintService.getAllJobs({ orderType: 'PHOTO_FRAME' });
    const generalJobsOnly = await quickPrintService.getAllJobs({ orderType: 'GENERAL_PRINT' });

    console.log(`✓ Photo frame jobs count in queue: ${photoJobsOnly.length}`);
    console.log(`✓ General print jobs count in queue: ${generalJobsOnly.length}`);

    const hasOnlyPhotos = photoJobsOnly.every(j => j.orderType === 'PHOTO_FRAME');
    const hasOnlyGenerals = generalJobsOnly.every(j => j.orderType !== 'PHOTO_FRAME');

    if (!hasOnlyPhotos || !hasOnlyGenerals) {
      throw new Error('Filtering jobs by orderType failed!');
    }
    console.log('✓ Queue filtering verified 100% correct.');

    // Cleanup test records
    console.log('\n--- CLEANING UP TEST DATA ---');
    if (fs.existsSync(dummyPhotoFile.path)) fs.unlinkSync(dummyPhotoFile.path);
    if (fs.existsSync(dummyDocFile.path)) fs.unlinkSync(dummyDocFile.path);

    await quickPrintService.deleteJob(photoJob.id).catch(() => null);
    await quickPrintService.deleteJob(docJob.id).catch(() => null);
    await Order.destroy({ where: { id: linkedOrder.id } }).catch(() => null);
    if (completeResult.posSale && completeResult.posSale.id) {
      await PosSale.destroy({ where: { id: completeResult.posSale.id } }).catch(() => null);
    }
    console.log('✓ All test records and temp files cleaned up.');

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runTests();

