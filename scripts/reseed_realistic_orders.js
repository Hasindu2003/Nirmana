const { sequelize, Order, Customer, Payment, PosSale, PosSaleItem, StockItem } = require('../src/models');
const { getSriLankaTodayString } = require('../src/utils/dateUtils');
const posService = require('../src/services/posService');

async function reseedOrders() {
  console.log('================================================================');
  console.log('🔄 RESEEDING CLEAN REALISTIC ORDERS & POS TRANSACTIONS');
  console.log('================================================================');

  try {
    const today = getSriLankaTodayString();

    // 1. Remove existing test payments and orders
    console.log('\n--- 1. Removing existing test orders & order payments ---');
    await Payment.destroy({ where: {} });
    console.log('✓ Cleared Payment records.');

    // Remove POS sales that were order settlements or test sales
    await PosSaleItem.destroy({ where: {} });
    await PosSale.destroy({ where: {} });
    console.log('✓ Cleared POS sales ledger.');

    await Order.destroy({ where: {} });
    console.log('✓ Cleared all existing orders.');

    // 2. Ensure standard realistic customers exist
    console.log('\n--- 2. Setting up realistic customer directory ---');
    const customersData = [
      {
        customerCode: 'CUST-0001',
        name: 'Nimal Fernando',
        phone: '0775551234',
        email: 'nimal.fernando@gmail.com',
        companyName: 'Fernando Photography Studio',
        address: 'No 45, Galle Road, Colombo 03',
      },
      {
        customerCode: 'CUST-0002',
        name: 'Dilani Samarasinghe',
        phone: '0712223344',
        email: 'dilani.weddings@outlook.com',
        companyName: 'Elegance Wedding Planners',
        address: 'No 12, Kandy Road, Kiribathgoda',
      },
      {
        customerCode: 'CUST-0003',
        name: 'Apex Solutions Pvt Ltd',
        phone: '0112345678',
        email: 'procurement@apexsolutions.lk',
        companyName: 'Apex Solutions Pvt Ltd',
        address: 'Level 8, World Trade Center, Colombo 01',
      },
      {
        customerCode: 'CUST-0004',
        name: 'Kasun Perera',
        phone: '0769998877',
        email: 'kasun.perera99@yahoo.com',
        companyName: null,
        address: 'No 88, Highlevel Road, Nugegoda',
      },
      {
        customerCode: 'CUST-0005',
        name: 'University Student Union',
        phone: '0754445566',
        email: 'union@campus.ac.lk',
        companyName: 'University Student Union',
        address: 'Faculty of Engineering, Moratuwa',
      },
    ];

    const customerMap = {};
    for (const cData of customersData) {
      let cust = await Customer.findOne({ 
        where: {
          [require('sequelize').Op.or]: [
            { phone: cData.phone },
            { customerCode: cData.customerCode },
          ]
        }
      });
      if (!cust) {
        // Generate unique code if cData.customerCode is taken
        let code = cData.customerCode;
        let suffix = 1;
        while (await Customer.findOne({ where: { customerCode: code } })) {
          code = `CUST-${(100 + suffix).toString().padStart(4, '0')}`;
          suffix++;
        }
        cust = await Customer.create({ ...cData, customerCode: code });
      } else {
        cust.name = cData.name;
        cust.companyName = cData.companyName;
        cust.email = cData.email;
        cust.address = cData.address;
        await cust.save();
      }
      customerMap[cData.name] = cust;
      console.log(`✓ Customer: ${cust.name} (${cust.phone}, Code: ${cust.customerCode})`);
    }

    // 3. Insert realistic Photo Frame Studio Orders
    console.log('\n--- 3. Creating realistic Photo Frame Studio Orders ---');
    const photoFrameOrders = [
      {
        orderNumber: 'ORD-2026-0101',
        customerId: customerMap['Dilani Samarasinghe'].id,
        orderDate: today,
        dueDate: '2026-11-09',
        jobTitle: 'Luxury Teak Wood Wedding Frame 12x18 (Gold Border)',
        orderType: 'PHOTO_FRAME',
        paperMaterial: '12" x 18" Teak Wooden Frame with Anti-Reflective Glass',
        specifications: 'Portrait orientation, 2-inch teak moulding with inner gold slip, velvet back backing',
        quantity: 2,
        subtotal: 7000.00,
        discount: 500.00,
        discountType: 'FIXED',
        totalAmount: 6500.00,
        advancePaid: 3000.00,
        balanceAmount: 3500.00,
        status: 'RECEIVED',
        notes: 'Wedding reception photo. Client requested high-gloss Kodak metallic photo paper print inside.',
      },
      {
        orderNumber: 'ORD-2026-0102',
        customerId: customerMap['Nimal Fernando'].id,
        orderDate: today,
        dueDate: '2026-11-08',
        jobTitle: 'Studio Portrait Frame 10x12 (Matte Black with Mount)',
        orderType: 'PHOTO_FRAME',
        paperMaterial: '10" x 12" Photo Frame (Matte Black Wood)',
        specifications: 'Includes 1.5-inch acid-free white border mount and clear float glass',
        quantity: 3,
        subtotal: 4500.00,
        discount: 0.00,
        discountType: 'FIXED',
        totalAmount: 4500.00,
        advancePaid: 4500.00,
        balanceAmount: 0.00,
        status: 'PRINTING',
        notes: 'Family anniversary portraits. Paid in full at intake.',
      },
      {
        orderNumber: 'ORD-2026-0103',
        customerId: customerMap['Kasun Perera'].id,
        orderDate: today,
        dueDate: '2026-11-07',
        jobTitle: 'Executive Desk Photo Frame 8x10 (Rosewood Finish)',
        orderType: 'PHOTO_FRAME',
        paperMaterial: '8" x 10" Photo Frame (Rosewood Moulding)',
        specifications: 'Clear glass, tabletop easel stand + wall hanger clip',
        quantity: 1,
        subtotal: 1200.00,
        discount: 100.00,
        discountType: 'FIXED',
        totalAmount: 1100.00,
        advancePaid: 500.00,
        balanceAmount: 600.00,
        status: 'READY',
        notes: 'Graduation portrait. Framed and boxed. Ready for counter collection.',
      },
      {
        orderNumber: 'ORD-2026-0104',
        customerId: customerMap['Nimal Fernando'].id,
        orderDate: today,
        dueDate: '2026-11-06',
        jobTitle: 'Large Canvas Gallery Wrap Frame 16x24',
        orderType: 'PHOTO_FRAME',
        paperMaterial: '16" x 24" Stretched Canvas on 1.5" Pine Wood Sub-frame',
        specifications: 'Floating black outer shadow-box frame, UV protective matte varnish',
        quantity: 1,
        subtotal: 5500.00,
        discount: 0.00,
        discountType: 'FIXED',
        totalAmount: 5500.00,
        advancePaid: 5500.00,
        balanceAmount: 0.00,
        status: 'COMPLETED',
        notes: 'Delivered to Fernando Photography studio. Paid full balance.',
      },
      {
        orderNumber: 'ORD-2026-0105',
        customerId: customerMap['Kasun Perera'].id,
        orderDate: today,
        dueDate: '2026-11-10',
        jobTitle: 'Compact Tabletop Photo Frame 4x6',
        orderType: 'PHOTO_FRAME',
        paperMaterial: '4" x 6" Photo Frame with Glass',
        specifications: 'Silver metallic border, landscape orientation',
        quantity: 2,
        subtotal: 800.00,
        discount: 0.00,
        discountType: 'FIXED',
        totalAmount: 800.00,
        advancePaid: 0.00,
        balanceAmount: 800.00,
        status: 'CANCELLED',
        notes: 'Customer cancelled prior to framing: photo resolution provided was too low for print.',
      },
    ];

    for (const fOrd of photoFrameOrders) {
      const created = await Order.create(fOrd);
      console.log(`✓ Created Photo Frame Order: #${created.orderNumber} - ${created.jobTitle} [${created.status}]`);
    }

    // 4. Insert realistic General Commercial Printing Orders
    console.log('\n--- 4. Creating realistic General Commercial Printing Orders ---');
    const generalPrintingOrders = [
      {
        orderNumber: 'ORD-2026-0201',
        customerId: customerMap['Apex Solutions Pvt Ltd'].id,
        orderDate: today,
        dueDate: '2026-11-10',
        jobTitle: 'Executive Matte Laminated Business Cards (1000 Pcs)',
        orderType: 'GENERAL_PRINT',
        paperMaterial: '350gsm Sappi Art Board with Double Sided Velvet Matte Lamination',
        specifications: 'Double sided full color CMYK print, spot UV logo on front, rounded corners',
        quantity: 1000,
        subtotal: 6000.00,
        discount: 500.00,
        discountType: 'FIXED',
        totalAmount: 5500.00,
        advancePaid: 2500.00,
        balanceAmount: 3000.00,
        status: 'PRINTING',
        notes: '10 names x 100 cards each. Proof artwork approved by procurement team.',
      },
      {
        orderNumber: 'ORD-2026-0202',
        customerId: customerMap['Apex Solutions Pvt Ltd'].id,
        orderDate: today,
        dueDate: '2026-11-12',
        jobTitle: 'Tri-Fold Marketing Brochures (500 Pcs)',
        orderType: 'GENERAL_PRINT',
        paperMaterial: '150gsm Gloss Art Paper',
        specifications: 'A4 full color double sided, machine scored and tri-folded (C-fold)',
        quantity: 500,
        subtotal: 8500.00,
        discount: 0.00,
        discountType: 'FIXED',
        totalAmount: 8500.00,
        advancePaid: 4000.00,
        balanceAmount: 4500.00,
        status: 'RECEIVED',
        notes: 'Annual IT tech expo collateral. Awaiting high-res sponsor logos.',
      },
      {
        orderNumber: 'ORD-2026-0203',
        customerId: customerMap['Dilani Samarasinghe'].id,
        orderDate: today,
        dueDate: '2026-11-08',
        jobTitle: 'Custom Ceramic Photo Mugs with Gift Boxes (12 Pcs)',
        orderType: 'GENERAL_PRINT',
        paperMaterial: '11oz White Ceramic Sublimation Mug with Inner Pink Coating',
        specifications: 'Full wrap vibrant sublimation print, individual smash-proof white gift box',
        quantity: 12,
        subtotal: 10200.00,
        discount: 600.00,
        discountType: 'FIXED',
        totalAmount: 9600.00,
        advancePaid: 5000.00,
        balanceAmount: 4600.00,
        status: 'READY',
        notes: 'Bridesmaids souvenir mugs. Checked and packaged in shop.',
      },
      {
        orderNumber: 'ORD-2026-0204',
        customerId: customerMap['University Student Union'].id,
        orderDate: today,
        dueDate: '2026-11-06',
        jobTitle: 'Final Year Engineering Thesis Reports (8 Books, Hard Bound)',
        orderType: 'GENERAL_PRINT',
        paperMaterial: '80gsm High White Bond Paper + Royal Blue Rexine Hard Binding with Gold Foil',
        specifications: '180 pages per book, color charts on 120gsm bond, golden embossed spine',
        quantity: 8,
        subtotal: 14400.00,
        discount: 1000.00,
        discountType: 'FIXED',
        totalAmount: 13400.00,
        advancePaid: 13400.00,
        balanceAmount: 0.00,
        status: 'COMPLETED',
        notes: 'Thesis submitted. Full payment cleared via bank transfer.',
      },
      {
        orderNumber: 'ORD-2026-0205',
        customerId: customerMap['Kasun Perera'].id,
        orderDate: today,
        dueDate: '2026-11-09',
        jobTitle: 'Outdoor Vinyl Event Banner 10ft x 4ft',
        orderType: 'GENERAL_PRINT',
        paperMaterial: 'Outdoor Heavy Gloss Vinyl 380gsm with Brass Eyelets every 2 feet',
        specifications: 'Eco-solvent high density CMYK print, hemmed edges with rope',
        quantity: 1,
        subtotal: 4800.00,
        discount: 0.00,
        discountType: 'FIXED',
        totalAmount: 4800.00,
        advancePaid: 0.00,
        balanceAmount: 4800.00,
        status: 'CANCELLED',
        notes: 'Cancelled: Event postponed by organizer due to rain.',
      },
    ];

    for (const gOrd of generalPrintingOrders) {
      const created = await Order.create(gOrd);
      console.log(`✓ Created General Print Order: #${created.orderNumber} - ${created.jobTitle} [${created.status}]`);
    }

    // 5. Generate authentic POS Transactions for completed settlements & counter retail
    console.log('\n--- 5. Generating authentic POS Sales Transactions ---');

    // 5A. Completed Photo Frame Settlement (ORD-2026-0104) -> POS
    const frameCompleted = await Order.findOne({ where: { orderNumber: 'ORD-2026-0104' } });
    if (frameCompleted) {
      await posService.createSale({
        customerName: 'Nimal Fernando',
        customerPhone: '0775551234',
        customerId: frameCompleted.customerId,
        paymentMethod: 'CASH',
        amountTendered: 5500.00,
        notes: `[Photo Frame Studio Settlement #${frameCompleted.orderNumber}] Job: ${frameCompleted.jobTitle}`,
        items: [{
          name: `Photo Frame Studio Settlement [${frameCompleted.orderNumber}]: ${frameCompleted.jobTitle}`,
          quantity: 1,
          unitPrice: 5500.00,
          unit: 'Frame',
          stockItemId: null,
        }],
      });
      console.log(`✓ Recorded POS Sale for Photo Frame Studio: #${frameCompleted.orderNumber} (Rs. 5,500.00)`);
    }

    // 5B. Completed General Commercial Print Settlement (ORD-2026-0204) -> POS
    const generalCompleted = await Order.findOne({ where: { orderNumber: 'ORD-2026-0204' } });
    if (generalCompleted) {
      await posService.createSale({
        customerName: 'University Student Union',
        customerPhone: '0754445566',
        customerId: generalCompleted.customerId,
        paymentMethod: 'BANK_TRANSFER',
        amountTendered: 13400.00,
        notes: `[Order Settlement #${generalCompleted.orderNumber}] Job: ${generalCompleted.jobTitle}`,
        items: [{
          name: `Print Order Settlement [${generalCompleted.orderNumber}]: ${generalCompleted.jobTitle}`,
          quantity: 1,
          unitPrice: 13400.00,
          unit: 'Job',
          stockItemId: null,
        }],
      });
      console.log(`✓ Recorded POS Sale for General Print Order: #${generalCompleted.orderNumber} (Rs. 13,400.00)`);
    }

    // 5C. Quick Print Self-Service POS transaction
    await posService.createSale({
      customerName: 'Walk-in Student',
      customerPhone: '0711122334',
      customerId: null,
      paymentMethod: 'CASH',
      amountTendered: 500.00,
      notes: '[Quick Print Self-Service Job Token #QP-882190]',
      items: [{
        name: 'Quick Print [Token #QP-882190]: 10x A4 Color Laser Printouts',
        quantity: 10,
        unitPrice: 50.00,
        unit: 'Pages',
        stockItemId: null,
      }],
    });
    console.log('✓ Recorded POS Sale for Quick Print QR (Rs. 500.00)');

    // 5D. Direct Retail Counter Sale (Stationery / Pens / Paper Reams)
    await posService.createSale({
      customerName: 'Walk-in Retail Customer',
      customerPhone: null,
      customerId: null,
      paymentMethod: 'CASH',
      amountTendered: 1800.00,
      notes: 'Counter retail sale',
      items: [
        {
          name: 'Double A 80gsm A4 Paper Ream',
          quantity: 1,
          unitPrice: 1450.00,
          unit: 'Ream',
          stockItemId: null,
        },
        {
          name: 'Gel Ink Pen 0.5mm Blue (Pack of 3)',
          quantity: 1,
          unitPrice: 350.00,
          unit: 'Pack',
          stockItemId: null,
        },
      ],
    });
    console.log('✓ Recorded POS Direct Counter Retail Sale (Rs. 1,800.00)');

    console.log('\n================================================================');
    console.log('✨ RESEEDING COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Reseeding failed:', err);
    process.exit(1);
  }
}

reseedOrders();
