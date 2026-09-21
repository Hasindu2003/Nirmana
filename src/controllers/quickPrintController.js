const QRCode = require('qrcode');
const quickPrintService = require('../services/quickPrintService');
const googleDriveService = require('../services/googleDriveService');

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
            paperSize: f.paperSize,
            colorMode: f.colorMode,
            copies: f.copies,
          })),
        },
      });
    } catch (error) {
      console.error('Error in submitUpload:', error);
      let details = error.message || 'Failed to upload files. Please try again.';
      if (error.errors && error.errors.length > 0) {
        const errorList = error.errors.map(e => {
          if (e.message && e.message !== 'Validation error') return e.message;
          if (e.path) return `${e.path} is invalid`;
          return null;
        }).filter(Boolean);

        if (errorList.length > 0) {
          details = [...new Set(errorList)].join(', ');
        }
      }
      return res.status(400).json({
        success: false,
        message: details,
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
   * Batch delete multiple jobs and cleanup their files
   */
  async batchDeleteJobs(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No order IDs provided for deletion.',
        });
      }

      let deletedCount = 0;
      const errors = [];

      for (const id of ids) {
        try {
          await quickPrintService.deleteJob(id);
          deletedCount++;
        } catch (err) {
          errors.push({ id, error: err.message });
        }
      }

      return res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} order(s).`,
        deletedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Batch delete failed.',
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

  /**
   * View / stream uploaded file inline (supports Google Drive and Local)
   */
  async viewFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const fileData = await quickPrintService.getFileStream(fileId);

      if (fileData.redirectUrl) {
        return res.redirect(fileData.redirectUrl);
      }

      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileData.originalName)}"`);
      if (fileData.fileSize) {
        res.setHeader('Content-Length', fileData.fileSize);
      }

      fileData.stream.pipe(res);
    } catch (error) {
      return res.status(404).send('File not found or no longer available.');
    }
  }

  /**
   * Download uploaded file as attachment
   */
  async downloadFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const fileData = await quickPrintService.getFileStream(fileId);

      if (fileData.redirectUrl) {
        return res.redirect(fileData.redirectUrl);
      }

      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.originalName)}"`);
      if (fileData.fileSize) {
        res.setHeader('Content-Length', fileData.fileSize);
      }

      fileData.stream.pipe(res);
    } catch (error) {
      return res.status(404).send('File not found or no longer available.');
    }
  }

  /**
   * Initialize a direct resumable upload session with Google Drive.
   * This allows files of 10MB, 20MB, 50MB+ to upload directly to Google Drive,
   * bypassing Vercel's 4.5MB serverless payload limit.
   */
  async initDirectUpload(req, res) {
    try {
      const { filename, mimeType, fileSize, tokenHint } = req.body;
      if (!filename) {
        return res.status(400).json({ success: false, message: 'Filename is required.' });
      }

      const displayName = tokenHint ? `[${tokenHint}] ${filename}` : filename;
      const sessionUrl = await googleDriveService.createResumableSession(
        displayName,
        mimeType,
        fileSize ? parseInt(fileSize, 10) : null,
        'Direct customer upload via Nirmana Express Print'
      );

      return res.json({
        success: true,
        sessionUrl,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Could not initialize cloud upload: ' + error.message,
      });
    }
  }

  /**
   * Finalize a direct upload job once files have been written to Google Drive
   */
  async completeDirectUpload(req, res) {
    try {
      const { customerName, customerPhone, customerMessage, colorMode, copies, paperSize, files } = req.body;

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'No uploaded files provided.' });
      }

      // Finalize each Drive file (set public permissions and fetch links)
      const finalizedFiles = [];
      for (const f of files) {
        if (f.driveFileId) {
          try {
            const driveMeta = await googleDriveService.finalizeDriveFile(f.driveFileId);
            finalizedFiles.push({
              driveFileId: f.driveFileId,
              originalName: f.originalName || driveMeta.name,
              fileSize: f.fileSize || driveMeta.fileSize,
              mimeType: f.mimeType || driveMeta.mimeType,
              webViewLink: driveMeta.webViewLink,
              webContentLink: driveMeta.webContentLink,
              paperSize: f.paperSize || paperSize || 'A4',
              colorMode: f.colorMode || colorMode || 'BW',
              copies: parseInt(f.copies, 10) || parseInt(copies, 10) || 1,
            });
          } catch (finErr) {
            console.warn('Finalize error for file:', finErr.message);
            finalizedFiles.push({
              driveFileId: f.driveFileId,
              originalName: f.originalName || 'document',
              fileSize: f.fileSize || 0,
              mimeType: f.mimeType || 'application/octet-stream',
              webViewLink: `https://drive.google.com/file/d/${f.driveFileId}/view`,
              webContentLink: `https://drive.google.com/uc?id=${f.driveFileId}&export=download`,
              paperSize: f.paperSize || paperSize || 'A4',
              colorMode: f.colorMode || colorMode || 'BW',
              copies: parseInt(f.copies, 10) || parseInt(copies, 10) || 1,
            });
          }
        }
      }

      const result = await quickPrintService.createJobWithDriveFiles({
        customerName,
        customerPhone,
        customerMessage,
        colorMode,
        copies,
        paperSize,
      }, finalizedFiles);

      return res.status(201).json({
        success: true,
        message: 'Print job submitted successfully.',
        data: {
          jobId: result.job.id,
          tokenNumber: result.job.tokenNumber,
          customerName: result.job.customerName,
          filesCount: result.files.length,
          colorMode: result.job.colorMode,
          copies: result.job.copies,
          paperSize: result.job.paperSize,
          files: result.files,
        },
      });
    } catch (error) {
      console.error('Error in completeDirectUpload:', error);
      let details = error.message || 'Failed to complete direct upload. Please try again.';
      if (error.errors && error.errors.length > 0) {
        const errorList = error.errors.map(e => {
          if (e.message && e.message !== 'Validation error') return e.message;
          if (e.path) return `${e.path} is invalid`;
          return null;
        }).filter(Boolean);

        if (errorList.length > 0) {
          details = [...new Set(errorList)].join(', ');
        }
      }
      return res.status(400).json({
        success: false,
        message: details,
      });
    }
  }

  /**
   * Chunk upload proxy for networks with strict CORS
   */
  async proxyUploadChunk(req, res) {
    try {
      const sessionUrl = req.headers['x-session-url'];
      const contentRange = req.headers['content-range'];
      const contentType = req.headers['content-type'] || 'application/octet-stream';

      if (!sessionUrl) {
        return res.status(400).json({ success: false, message: 'Session URL is required.' });
      }

      let buffer;
      if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }

      const gResponse = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': contentRange,
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
        },
        body: buffer,
      });

      if (gResponse.status === 308) {
        return res.status(200).json({
          success: true,
          status: 308,
          range: gResponse.headers.get('range'),
        });
      }

      if (gResponse.ok) {
        const data = await gResponse.json();
        return res.status(200).json({ success: true, status: 200, file: data });
      }

      const errText = await gResponse.text();
      return res.status(gResponse.status).json({ success: false, message: errText });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Check current Google Drive cloud storage connectivity status
   */
  async getStorageStatus(req, res) {
    try {
      const status = await googleDriveService.verifyConnection();
      return res.json({ success: true, ...status });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new QuickPrintController();
