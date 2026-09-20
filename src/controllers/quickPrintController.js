const QRCode = require('qrcode');
const quickPrintService = require('../services/quickPrintService');

class QuickPrintController {
  /**
   * Handle customer walk-in file upload (from mobile via QR code)
   */
  async submitUpload(req, res) {
    try {
      const files = req.files || [];
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please select at least one file or image to print.',
        });
      }

      const result = await quickPrintService.createJob(req.body, files);

      return res.status(201).json({
        success: true,
        message: `Your files have been sent to the shop counter! Your token is #${result.job.tokenNumber}`,
        data: {
          jobId: result.job.id,
          tokenNumber: result.job.tokenNumber,
          customerName: result.job.customerName,
          status: result.job.status,
          paperSize: result.job.paperSize,
          colorMode: result.job.colorMode,
          copies: result.job.copies,
          filesCount: result.files.length,
          files: result.files.map(f => ({
            id: f.id,
            originalName: f.originalName,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
            fileUrl: f.fileUrl,
          })),
        },
      });
    } catch (error) {
      console.error('Error in submitUpload:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to upload files. Please try again.',
      });
    }
  }

  /**
   * Status check endpoint for customer's mobile phone
   */
  async getJobStatus(req, res) {
    try {
      const { id } = req.params;
      const job = await quickPrintService.getJobById(id);

      return res.json({
        success: true,
        data: {
          id: job.id,
          tokenNumber: job.tokenNumber,
          customerName: job.customerName,
          status: job.status,
          customerMessage: job.customerMessage,
          colorMode: job.colorMode,
          copies: job.copies,
          paperSize: job.paperSize,
          filesCount: job.files.length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Job not found',
      });
    }
  }

  /**
   * List jobs for the shopkeeper counter queue
   */
  async listJobs(req, res, next) {
    try {
      const { status, search } = req.query;
      const [jobs, stats] = await Promise.all([
        quickPrintService.getAllJobs({ status, search }),
        quickPrintService.getQueueStats(),
      ]);

      return res.json({
        success: true,
        data: jobs,
        stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update status (e.g. PRINTING, READY, COMPLETED)
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, message: 'Status is required.' });
      }

      const updatedJob = await quickPrintService.updateJobStatus(id, status);

      return res.json({
        success: true,
        message: `Token #${updatedJob.tokenNumber} marked as ${status}.`,
        data: updatedJob,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Delete job and cleanup disk files
   */
  async deleteJob(req, res) {
    try {
      const { id } = req.params;
      await quickPrintService.deleteJob(id);

      return res.json({
        success: true,
        message: 'Job deleted successfully.',
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Convert to formal billing order
   */
  async convertToOrder(req, res) {
    try {
      const { id } = req.params;
      const result = await quickPrintService.convertToFormalOrder(id, req.body);

      return res.json({
        success: true,
        message: `Quick print job #${result.job.tokenNumber} converted to Order #${result.order.orderNumber}.`,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Generate QR code dynamically based on current host or custom URL
   */
  async generateQrCode(req, res) {
    try {
      const { getUploadUrl } = require('../utils/network');
      // Determine host dynamically: if accessed via localhost, use Wi-Fi / LAN IP so phones can connect!
      const defaultUrl = getUploadUrl(req);
      const targetUrl = (req.query.url || defaultUrl).trim();
      const download = req.query.download === 'true' || req.query.download === '1';

      if (download) {
        // High-res PNG for download
        res.setHeader('Content-Disposition', 'attachment; filename="nirmana-counter-qr.png"');
        res.setHeader('Content-Type', 'image/png');
        return QRCode.toFileStream(res, targetUrl, {
          width: 1200,
          margin: 2,
          color: {
            dark: '#1e293b',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        });
      }

      // Return JSON with base64 Data URL
      const qrDataUrl = await QRCode.toDataURL(targetUrl, {
        width: 480,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });

      return res.json({
        success: true,
        targetUrl,
        qrDataUrl,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate QR code.',
        error: error.message,
      });
    }
  }

  /**
   * Get queue statistics for header badges
   */
  async getStats(req, res, next) {
    try {
      const stats = await quickPrintService.getQueueStats();
      return res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new QuickPrintController();
