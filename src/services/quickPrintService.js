const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { QuickPrintJob, QuickPrintFile, Customer, Order, sequelize } = require('../models');

class QuickPrintService {
  /**
   * Generates a daily sequential token number (e.g. QP-001, QP-002)
   */
  async generateTokenNumber(transaction = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await QuickPrintJob.count({
      where: {
        createdAt: {
          [Op.gte]: today,
        },
      },
      transaction,
    });

    const tokenNum = (count + 1).toString().padStart(3, '0');
    return `QP-${tokenNum}`;
  }

  /**
   * Normalizes Sri Lankan or international phone numbers to standard 10-digit format
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+94')) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('94') && cleaned.length === 11) {
      cleaned = '0' + cleaned.substring(2);
    }
    // Return only numeric digits
    return cleaned.replace(/\D/g, '');
  }

  /**
   * Create a new quick print job with attached files
   */
  async createJob(data, uploadedFiles = []) {
    return await sequelize.transaction(async (t) => {
      const customerName = (data.customerName || data.name || '').trim();
      const rawPhone = (data.customerPhone || data.phone || '').trim();
      const customerPhone = this.normalizePhoneNumber(rawPhone);

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

      // Check or create customer record in CRM
      let customerId = null;
      try {
        let existingCustomer = null;
        if (/^0\d{9}$/.test(customerPhone)) {
          existingCustomer = await Customer.findOne({
            where: { phone: customerPhone },
            transaction: t,
          });

          if (!existingCustomer) {
            const custCount = await Customer.count({ transaction: t });
            const customerCode = `CUST-${(custCount + 1).toString().padStart(4, '0')}`;
            existingCustomer = await Customer.create({
              customerCode,
              name: customerName,
              phone: customerPhone,
              notes: 'Created automatically via Counter QR Quick Print',
            }, { transaction: t });
          }
          customerId = existingCustomer.id;
        }
      } catch (err) {
        // Non-fatal: if customer validation fails, proceed with guest upload
        console.warn('Could not auto-link Customer CRM record:', err.message);
      }

      const tokenNumber = await this.generateTokenNumber(t);

      const job = await QuickPrintJob.create({
        tokenNumber,
        customerName,
        customerPhone: customerPhone || rawPhone,
        customerMessage: (data.customerMessage || data.message || '').trim() || null,
        colorMode: ['COLOR', 'BW', 'MIXED'].includes(data.colorMode) ? data.colorMode : 'NOT_SPECIFIED',
        copies: parseInt(data.copies, 10) > 0 ? parseInt(data.copies, 10) : 1,
        paperSize: (data.paperSize || 'A4').trim(),
        status: 'PENDING',
        customerId,
      }, { transaction: t });

      // Save file records
      const fileRecords = [];
      for (const file of uploadedFiles) {
        const fileUrl = `/uploads/quick-print/${file.filename}`;
        const fileRecord = await QuickPrintFile.create({
          jobId: job.id,
          originalName: file.originalname,
          filename: file.filename,
          filePath: file.path,
          fileSize: file.size,
          mimeType: file.mimetype,
          fileUrl,
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

    // Delete disk files
    if (job.files && job.files.length > 0) {
      for (const file of job.files) {
        try {
          if (file.filePath && fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
          }
        } catch (e) {
          console.warn('Could not delete physical file:', file.filePath, e.message);
        }
      }
    }

    await job.destroy();
    return true;
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
      jobTitle: orderOptions.jobTitle || `Walk-in Print: ${job.customerName} (${job.tokenNumber})`,
      paperMaterial: orderOptions.paperMaterial || job.paperSize,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingCount, completedTodayCount, allCompletedCount, totalTodayCount] = await Promise.all([
      QuickPrintJob.count({ where: { status: 'PENDING' } }),
      QuickPrintJob.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { [Op.gte]: today },
        },
      }),
      QuickPrintJob.count({ where: { status: 'COMPLETED' } }),
      QuickPrintJob.count({
        where: {
          createdAt: { [Op.gte]: today },
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
