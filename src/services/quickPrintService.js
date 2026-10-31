const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { QuickPrintJob, QuickPrintFile, Customer, Order, sequelize } = require('../models');
const googleDriveService = require('./googleDriveService');
const { getSriLankaDayBounds } = require('../utils/dateUtils');

class QuickPrintService {
  /**
   * Generates a daily date-based sequential token number in Sri Lanka timezone
   * Format: QP-MMDDXX (e.g. October 17, 8th order -> QP-101708)
   */
  async generateTokenNumber(transaction = null) {
    const { dateStr } = getSriLankaDayBounds();
    const parts = dateStr.split('-');
    const month = parts[1];
    const day = parts[2];
    const prefix = `QP-${month}${day}`;

    // Find all tokens created for this date prefix to determine the highest order counter
    const todayJobs = await QuickPrintJob.findAll({
      where: {
        tokenNumber: {
          [Op.like]: `${prefix}%`,
        },
      },
      attributes: ['tokenNumber'],
      transaction,
    }).catch(() => []);

    let maxCounter = 0;
    for (const job of todayJobs) {
      if (job && job.tokenNumber && job.tokenNumber.startsWith(prefix)) {
        const suffix = job.tokenNumber.substring(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxCounter) {
          maxCounter = num;
        }
      }
    }

    let nextCounter = maxCounter + 1;
    let candidate = `${prefix}${nextCounter.toString().padStart(2, '0')}`;

    // Collision safety guard for concurrent transactions
    while (await QuickPrintJob.findOne({ where: { tokenNumber: candidate }, transaction })) {
      nextCounter++;
      candidate = `${prefix}${nextCounter.toString().padStart(2, '0')}`;
    }

    return candidate;
  }

  /**
   * Normalizes Sri Lankan or international phone numbers to standard 10-digit format
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    let str = phone.toString().trim();
    if (str.startsWith('+94')) {
      str = '0' + str.substring(3);
    } else if (str.startsWith('94') && str.replace(/\D/g, '').length === 11) {
      str = '0' + str.replace(/\D/g, '').substring(2);
    }
    let digits = str.replace(/\D/g, '');
    // If user entered 9 digits (e.g. 771234567 or 112345678), auto prepend leading 0
    if (digits.length === 9) {
      digits = '0' + digits;
    }
    return digits;
  }

  /**
   * Create a new quick print job with attached files
   */
  async createJob(data, uploadedFiles = []) {
    const rawName = (data.customerName || data.name || '').trim();
    const rawPhone = (data.customerPhone || data.phone || '').trim();
    const customerPhone = this.normalizePhoneNumber(rawPhone);
    const customerName = rawName.substring(0, 100);

    if (!customerName) {
      throw new Error('Please enter your name.');
    }

    if (!customerPhone) {
      throw new Error('Please enter your phone number.');
    }

    if (customerPhone.length !== 10 || !/^\d{10}$/.test(customerPhone)) {
      throw new Error('Phone number can have only 10 digits. No less or more.');
    }

    if (uploadedFiles.length === 0) {
      throw new Error('Please select at least one file to upload.');
    }

    // Do NOT auto-create customers for Quick Print walk-ins.
    // Only link customerId if they are already an existing registered CRM customer.
    let customerId = null;
    try {
      if (/^0\d{9}$/.test(customerPhone)) {
        const existingCustomer = await Customer.findOne({
          where: { phone: customerPhone, isActive: true },
        }).catch(() => null);
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }
    } catch (err) {
      console.warn('Could not check existing Customer CRM record:', err.message);
    }

    return await sequelize.transaction(async (t) => {

      const tokenNumber = await this.generateTokenNumber(t);
      // Parse per-file paper sizes if provided
      let filePaperSizes = [];
      if (data.filePaperSizes) {
        try {
          filePaperSizes = typeof data.filePaperSizes === 'string'
            ? JSON.parse(data.filePaperSizes)
            : data.filePaperSizes;
        } catch (e) {
          filePaperSizes = Array.isArray(data.filePaperSizes) ? data.filePaperSizes : [data.filePaperSizes];
        }
      }

      // Parse per-file color modes if provided
      let fileColorModes = [];
      if (data.fileColorModes) {
        try {
          fileColorModes = typeof data.fileColorModes === 'string'
            ? JSON.parse(data.fileColorModes)
            : data.fileColorModes;
        } catch (e) {
          fileColorModes = Array.isArray(data.fileColorModes) ? data.fileColorModes : [data.fileColorModes];
        }
      }

      // Parse per-file copies if provided
      let fileCopies = [];
      if (data.fileCopies) {
        try {
          fileCopies = typeof data.fileCopies === 'string'
            ? JSON.parse(data.fileCopies)
            : data.fileCopies;
        } catch (e) {
          fileCopies = Array.isArray(data.fileCopies) ? data.fileCopies : [data.fileCopies];
        }
      }

      // Calculate effective overall paper size
      let effectivePaperSize = (data.paperSize || 'A4').trim();
      if (filePaperSizes && filePaperSizes.length > 0) {
        const uniqueSizes = [...new Set(filePaperSizes.map(s => (s || '').trim()).filter(Boolean))];
        if (uniqueSizes.length > 1) {
          effectivePaperSize = `Mixed (${uniqueSizes.join(', ')})`.substring(0, 100);
        } else if (uniqueSizes.length === 1) {
          effectivePaperSize = uniqueSizes[0];
        }
      }

      // Calculate effective overall color mode
      let effectiveColorMode = ['COLOR', 'BW', 'MIXED'].includes(data.colorMode) ? data.colorMode : 'BW';
      if (fileColorModes && fileColorModes.length > 0) {
        const uniqueModes = [...new Set(fileColorModes.map(m => (m || '').toUpperCase().trim()).filter(Boolean))];
        if (uniqueModes.length > 1) {
          effectiveColorMode = 'MIXED';
        } else if (uniqueModes.length === 1) {
          effectiveColorMode = uniqueModes[0] === 'COLOR' ? 'COLOR' : 'BW';
        }
      }

      // Calculate effective overall copies
      let effectiveCopies = parseInt(data.copies, 10) > 0 ? parseInt(data.copies, 10) : 1;
      if (fileCopies && fileCopies.length > 0) {
        const validCopies = fileCopies.map(c => parseInt(c, 10) || 1);
        const allSame = validCopies.every(c => c === validCopies[0]);
        if (allSame) {
          effectiveCopies = validCopies[0];
        } else {
          effectiveCopies = validCopies.reduce((sum, c) => sum + c, 0);
        }
      }

      const job = await QuickPrintJob.create({
        tokenNumber,
        customerName: customerName.substring(0, 100),
        customerPhone: customerPhone || rawPhone,
        customerMessage: (data.customerMessage || data.message || '').trim().substring(0, 1000) || null,
        colorMode: (effectiveColorMode || 'BW').substring(0, 20),
        copies: effectiveCopies,
        paperSize: (effectivePaperSize || 'A4').substring(0, 100),
        status: 'PENDING',
        customerId,
      }, { transaction: t });

      // Save file records (upload to Google Drive if configured, else store local)
      const fileRecords = [];
      const isDriveEnabled = googleDriveService.isConfigured();

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const perFilePaperSize = (filePaperSizes && filePaperSizes[i]) || data.paperSize || 'A4';
        const perFileColorMode = (fileColorModes && fileColorModes[i]) || data.colorMode || 'BW';
        const perFileCopies = (fileCopies && parseInt(fileCopies[i], 10) > 0) ? parseInt(fileCopies[i], 10) : (parseInt(data.copies, 10) || 1);
        let driveFileId = null;
        let driveViewLink = null;
        let driveDownloadLink = null;
        let storageProvider = 'LOCAL';

        if (isDriveEnabled) {
          try {
            const driveUpload = await googleDriveService.uploadFile(
              file.path,
              `[${job.tokenNumber}] ${file.originalname}`,
              file.mimetype,
              `Customer: ${customerName} (${customerPhone || 'N/A'}) - Token: ${job.tokenNumber} - Size: ${perFilePaperSize} - Mode: ${perFileColorMode} - Copies: ${perFileCopies}`
            );
            if (driveUpload && driveUpload.id) {
              driveFileId = driveUpload.id;
              driveViewLink = driveUpload.webViewLink;
              driveDownloadLink = driveUpload.webContentLink;
              storageProvider = 'GDRIVE';
            }
          } catch (driveErr) {
            console.warn(`[Google Drive] Upload failed for ${file.originalname}, falling back to local:`, driveErr.message);
          }
        }

        const fileUrl = `/uploads/quick-print/${file.filename}`.substring(0, 250);
        const fileRecord = await QuickPrintFile.create({
          jobId: job.id,
          originalName: (file.originalname || 'document').substring(0, 240),
          filename: (file.filename || 'file').substring(0, 240),
          filePath: (file.path || '').substring(0, 240),
          fileSize: file.size || 0,
          mimeType: (file.mimetype || 'application/octet-stream').substring(0, 100),
          fileUrl,
          driveFileId,
          driveViewLink,
          driveDownloadLink,
          storageProvider,
          paperSize: (perFilePaperSize || 'A4').substring(0, 50),
          colorMode: (perFileColorMode || 'BW').substring(0, 20),
          copies: perFileCopies,
        }, { transaction: t });
        fileRecords.push(fileRecord);
      }

      return {
        job,
        files: fileRecords,
      };
    });
  }

  /**
   * Create a quick print job where files were uploaded directly to Google Drive
   * (Used for large files 10MB+ to bypass Vercel's 4.5MB limit)
   */
  async createJobWithDriveFiles(data, driveFiles = []) {
    const rawName = (data.customerName || data.name || '').trim();
    const rawPhone = (data.customerPhone || data.phone || '').trim();
    const customerPhone = this.normalizePhoneNumber(rawPhone);
    const customerName = rawName.substring(0, 100);

    if (!customerName) {
      throw new Error('Please enter your name.');
    }

    if (!customerPhone) {
      throw new Error('Please enter your phone number.');
    }

    if (customerPhone.length !== 10 || !/^\d{10}$/.test(customerPhone)) {
      throw new Error('Phone number can have only 10 digits. No less or more.');
    }

    if (!driveFiles || driveFiles.length === 0) {
      throw new Error('No uploaded files provided.');
    }

    // Do NOT auto-create customers for Quick Print walk-ins.
    // Only link customerId if they are already an existing registered CRM customer.
    let customerId = null;
    try {
      if (/^0\d{9}$/.test(customerPhone)) {
        const existingCustomer = await Customer.findOne({
          where: { phone: customerPhone, isActive: true },
        }).catch(() => null);
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }
    } catch (err) {
      console.warn('Could not check existing Customer CRM record:', err.message);
    }

    return await sequelize.transaction(async (t) => {
      const tokenNumber = await this.generateTokenNumber(t);

      // Calculate effective overall paper size from driveFiles
      let effectivePaperSize = (data.paperSize || 'A4').trim();
      const drivePaperSizes = driveFiles.map(df => (df.paperSize || data.paperSize || 'A4').trim());
      const uniqueSizes = [...new Set(drivePaperSizes.filter(Boolean))];
      if (uniqueSizes.length > 1) {
        effectivePaperSize = `Mixed (${uniqueSizes.join(', ')})`.substring(0, 100);
      } else if (uniqueSizes.length === 1) {
        effectivePaperSize = uniqueSizes[0];
      }

      // Calculate effective overall color mode from driveFiles
      let effectiveColorMode = ['COLOR', 'BW', 'MIXED'].includes(data.colorMode) ? data.colorMode : 'BW';
      const driveColorModes = driveFiles.map(df => (df.colorMode || data.colorMode || 'BW').toUpperCase().trim());
      const uniqueModes = [...new Set(driveColorModes.filter(Boolean))];
      if (uniqueModes.length > 1) {
        effectiveColorMode = 'MIXED';
      } else if (uniqueModes.length === 1) {
        effectiveColorMode = uniqueModes[0] === 'COLOR' ? 'COLOR' : 'BW';
      }

      // Calculate effective overall copies from driveFiles
      let effectiveCopies = parseInt(data.copies, 10) > 0 ? parseInt(data.copies, 10) : 1;
      const driveCopies = driveFiles.map(df => parseInt(df.copies, 10) || parseInt(data.copies, 10) || 1);
      if (driveCopies.length > 0) {
        const allSame = driveCopies.every(c => c === driveCopies[0]);
        if (allSame) {
          effectiveCopies = driveCopies[0];
        } else {
          effectiveCopies = driveCopies.reduce((sum, c) => sum + c, 0);
        }
      }

      const job = await QuickPrintJob.create({
        tokenNumber,
        customerName: customerName.substring(0, 100),
        customerPhone: customerPhone || rawPhone,
        customerMessage: (data.customerMessage || data.message || '').trim().substring(0, 1000) || null,
        colorMode: (effectiveColorMode || 'BW').substring(0, 20),
        copies: effectiveCopies,
        paperSize: (effectivePaperSize || 'A4').substring(0, 100),
        status: 'PENDING',
        customerId,
      }, { transaction: t });

      const fileRecords = [];
      for (const df of driveFiles) {
        const perFilePaperSize = df.paperSize || data.paperSize || 'A4';
        const perFileColorMode = df.colorMode || data.colorMode || 'BW';
        const perFileCopies = parseInt(df.copies, 10) > 0 ? parseInt(df.copies, 10) : (parseInt(data.copies, 10) || 1);

        const fileRecord = await QuickPrintFile.create({
          jobId: job.id,
          originalName: (df.originalName || df.name || 'document').substring(0, 240),
          filename: (df.originalName || df.name || 'document').substring(0, 240),
          filePath: '',
          fileSize: df.fileSize || 0,
          mimeType: (df.mimeType || 'application/octet-stream').substring(0, 100),
          fileUrl: (df.webViewLink || `/api/quick-print/files/${df.driveFileId}/view`).substring(0, 250),
          driveFileId: df.driveFileId,
          driveViewLink: df.webViewLink,
          driveDownloadLink: df.webContentLink,
          storageProvider: 'GDRIVE',
          paperSize: (perFilePaperSize || 'A4').substring(0, 50),
          colorMode: (perFileColorMode || 'BW').substring(0, 20),
          copies: perFileCopies,
        }, { transaction: t });
        fileRecords.push(fileRecord);
      }

      return {
        job,
        files: fileRecords,
      };
    });
  }

  /**
   * Get all jobs with optional filters
   */
  async getAllJobs({ status = 'ALL', search = '', limit = 100 } = {}) {
    const where = {};

    if (status === 'ACTIVE') {
      where.status = { [Op.in]: ['PENDING', 'PRINTING'] };
    } else if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { tokenNumber: { [Op.like]: q } },
        { customerName: { [Op.like]: q } },
        { customerPhone: { [Op.like]: q } },
        { customerMessage: { [Op.like]: q } },
      ];
    }

    return await QuickPrintJob.findAll({
      where,
      include: [
        {
          model: QuickPrintFile,
          as: 'files',
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'phone', 'customerCode'],
        },
      ],
      order: [
        // Pending first, then Printing, then Ready, then Completed
        [
          sequelize.literal(`
            CASE status
              WHEN 'PENDING' THEN 1
              WHEN 'PRINTING' THEN 2
              WHEN 'READY' THEN 3
              WHEN 'COMPLETED' THEN 4
              WHEN 'CANCELLED' THEN 5
              ELSE 6
            END
          `),
          'ASC',
        ],
        ['createdAt', 'DESC'],
      ],
      limit,
    });
  }

  /**
   * Get job by ID with files
   */
  async getJobById(id) {
    const job = await QuickPrintJob.findByPk(id, {
      include: [
        {
          model: QuickPrintFile,
          as: 'files',
        },
        {
          model: Customer,
          as: 'customer',
        },
        {
          model: Order,
          as: 'order',
        },
      ],
    });

    if (!job) {
      throw new Error('Quick print job not found.');
    }
    return job;
  }

  /**
   * Update status of a quick print job
   */
  async updateJobStatus(id, newStatus) {
    const validStatuses = ['PENDING', 'PRINTING', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
    }

    const job = await QuickPrintJob.findByPk(id, {
      include: [{ model: QuickPrintFile, as: 'files' }],
    });

    if (!job) {
      throw new Error('Quick print job not found.');
    }

    job.status = newStatus;
    if (newStatus === 'PRINTING' && !job.printedAt) {
      job.printedAt = new Date();
    }
    if (newStatus === 'COMPLETED' && !job.completedAt) {
      job.completedAt = new Date();
    }

    await job.save();
    return job;
  }

  /**
   * Delete a quick print job and remove its files from disk
   */
  async deleteJob(id) {
    const job = await QuickPrintJob.findByPk(id, {
      include: [{ model: QuickPrintFile, as: 'files' }],
    });

    if (!job) {
      throw new Error('Job not found.');
    }

    // Delete disk files & Google Drive files
    if (job.files && job.files.length > 0) {
      for (const file of job.files) {
        try {
          if (file.filePath && fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
          }
        } catch (e) {
          console.warn('Could not delete physical file:', file.filePath, e.message);
        }

        if (file.driveFileId) {
          try {
            await googleDriveService.deleteFile(file.driveFileId);
          } catch (driveDelErr) {
            console.warn('Could not delete Google Drive file:', driveDelErr.message);
          }
        }
      }
    }

    await job.destroy();
    return true;
  }

  /**
   * Get file stream for download or in-app preview (supports Google Drive and Local)
   */
  async getFileStream(fileRecordId) {
    const file = await QuickPrintFile.findByPk(fileRecordId);
    if (!file) {
      throw new Error('File not found');
    }

    // Try Google Drive if available
    if (file.storageProvider === 'GDRIVE' && file.driveFileId && googleDriveService.isConfigured()) {
      try {
        const stream = await googleDriveService.getFileStream(file.driveFileId);
        return {
          stream,
          mimeType: file.mimeType,
          originalName: file.originalName,
          fileSize: file.fileSize,
          driveViewLink: file.driveViewLink,
        };
      } catch (driveStreamErr) {
        console.warn(`[Google Drive] Failed to stream ${file.driveFileId}, trying local fallback:`, driveStreamErr.message);
      }
    }

    // Local file fallback
    if (file.filePath && fs.existsSync(file.filePath)) {
      return {
        stream: fs.createReadStream(file.filePath),
        mimeType: file.mimeType,
        originalName: file.originalName,
        fileSize: file.fileSize,
        driveViewLink: file.driveViewLink,
      };
    }

    // If driveViewLink exists, return it so controller can redirect
    if (file.driveViewLink) {
      return {
        redirectUrl: file.driveViewLink,
        mimeType: file.mimeType,
        originalName: file.originalName,
      };
    }

    throw new Error('File data is no longer available on local disk or cloud storage.');
  }

  /**
   * Convert quick print job to a full Order
   */
  async convertToFormalOrder(id, orderOptions = {}) {
    const job = await this.getJobById(id);
    if (job.orderId) {
      throw new Error(`This job is already linked to Order #${job.orderId}.`);
    }

    const orderService = require('./orderService');

    // Build order data
    const fileSummary = job.files.map(f => f.originalName).join(', ');
    const specifications = [
      `Walk-in QR Print Job [Token: ${job.tokenNumber}]`,
      `Color Mode: ${job.colorMode}`,
      `Copies: ${job.copies}`,
      `Paper Size: ${job.paperSize}`,
      `Attached Files: ${fileSummary}`,
      job.customerMessage ? `Customer Message: ${job.customerMessage}` : '',
    ].filter(Boolean).join('\n');

    const orderData = {
      customerId: job.customerId,
      newCustomerName: job.customerId ? undefined : job.customerName,
      newCustomerPhone: job.customerId ? undefined : job.customerPhone,
      jobTitle: orderOptions.jobTitle || `${job.paperSize && job.paperSize !== 'A4' ? job.paperSize : 'Print Job'}: ${job.customerName} (${job.tokenNumber})`,
      paperMaterial: orderOptions.paperMaterial || job.paperSize || 'Standard Print',
      specifications,
      quantity: job.copies || 1,
      totalAmount: orderOptions.totalAmount || 0,
      advancePaid: orderOptions.advancePaid || 0,
      notes: `Converted from Quick Print ${job.tokenNumber}. Original files: ${job.files.map(f => f.fileUrl).join(', ')}`,
      status: job.status === 'COMPLETED' ? 'COMPLETED' : 'PRINTING',
    };

    const newOrder = await orderService.createOrder(orderData);

    job.orderId = newOrder.id;
    await job.save();

    return {
      order: newOrder,
      job,
    };
  }

  /**
   * Get queue statistics for dashboard badges and counter screen
   */
  async getQueueStats() {
    const { startOfDay, endOfDay } = getSriLankaDayBounds();

    const [pendingCount, completedTodayCount, allCompletedCount, totalTodayCount] = await Promise.all([
      QuickPrintJob.count({ where: { status: 'PENDING' } }),
      QuickPrintJob.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
        },
      }),
      QuickPrintJob.count({ where: { status: 'COMPLETED' } }),
      QuickPrintJob.count({
        where: {
          createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
        },
      }),
    ]);

    return {
      pending: pendingCount,
      completedToday: completedTodayCount,
      completedTotal: allCompletedCount,
      totalToday: totalTodayCount,
    };
  }
}

module.exports = new QuickPrintService();
