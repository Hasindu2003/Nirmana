const fs = require('fs');
const { google } = require('googleapis');

class GoogleDriveService {
  constructor() {
    this.driveClient = null;
    this.authClient = null;
  }

  /**
   * Parse credentials from environment variables.
   * Supports either:
   * 1. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
   * 2. GOOGLE_SERVICE_ACCOUNT_KEY (entire JSON key file as string)
   */
  getCredentials() {
    let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Check if whole JSON string is passed
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const parsed = typeof process.env.GOOGLE_SERVICE_ACCOUNT_KEY === 'string'
          ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
          : process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        clientEmail = clientEmail || parsed.client_email;
        privateKey = privateKey || parsed.private_key;
      } catch (err) {
        console.warn('Warning: Could not parse GOOGLE_SERVICE_ACCOUNT_KEY JSON:', err.message);
      }
    }

    // Format private key (replace escaped \n with actual newlines)
    if (privateKey && typeof privateKey === 'string') {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    return {
      clientEmail,
      privateKey,
      folderId,
    };
  }

  /**
   * Check if Google Drive storage is fully configured
   */
  isConfigured() {
    const { clientEmail, privateKey, folderId } = this.getCredentials();
    return Boolean(clientEmail && privateKey && folderId);
  }

  /**
   * Initialize and return authenticated Google Drive API client
   */
  getClient() {
    if (this.driveClient) return this.driveClient;

    const { clientEmail, privateKey } = this.getCredentials();
    if (!clientEmail || !privateKey) {
      throw new Error('Google Drive credentials (email/privateKey) are missing.');
    }

    this.authClient = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    this.driveClient = google.drive({
      version: 'v3',
      auth: this.authClient,
    });

    return this.driveClient;
  }

  /**
   * Upload a local file to Google Drive folder
   * @param {string} localFilePath - Full path to temporary/uploaded file on disk
   * @param {string} originalFilename - Display name for file in Google Drive
   * @param {string} mimeType - File MIME type
   * @param {string} description - Optional file description
   * @returns {Promise<{id: string, name: string, webViewLink: string, webContentLink: string}>}
   */
  async uploadFile(localFilePath, originalFilename, mimeType, description = '') {
    if (!this.isConfigured()) {
      throw new Error('Google Drive is not configured.');
    }

    const { folderId } = this.getCredentials();
    const drive = this.getClient();

    const fileMetadata = {
      name: originalFilename,
      parents: [folderId],
      description: description || 'Uploaded via Nirmana Printing Counter Queue',
    };

    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: fs.createReadStream(localFilePath),
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink, size, mimeType',
    });

    const fileData = res.data;

    // Set permission so that anyone with link can view (allows in-app preview & operator access)
    try {
      await drive.permissions.create({
        fileId: fileData.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (permErr) {
      console.warn('Could not set public read permission on Google Drive file:', permErr.message);
    }

    return {
      id: fileData.id,
      name: fileData.name,
      webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
      webContentLink: fileData.webContentLink || `https://drive.google.com/uc?id=${fileData.id}&export=download`,
    };
  }

  /**
   * Stream a file directly from Google Drive (for in-app preview / download)
   * @param {string} fileId - Google Drive file ID
   */
  async getFileStream(fileId) {
    const drive = this.getClient();
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return res.data;
  }

  /**
   * Delete a file from Google Drive
   * @param {string} fileId - Google Drive file ID
   */
  async deleteFile(fileId) {
    if (!this.isConfigured() || !fileId) return false;
    try {
      const drive = this.getClient();
      await drive.files.delete({ fileId });
      return true;
    } catch (err) {
      console.warn(`Could not delete file ${fileId} from Google Drive:`, err.message);
      return false;
    }
  }

  /**
   * Verify credentials and folder access
   */
  async verifyConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        configured: false,
        message: 'Google Drive environment variables are not set.',
      };
    }

    try {
      const { folderId, clientEmail } = this.getCredentials();
      const drive = this.getClient();
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, capabilities, shared',
      });

      return {
        success: true,
        configured: true,
        folderName: res.data.name,
        folderId: res.data.id,
        serviceAccountEmail: clientEmail,
        canAddChildren: res.data.capabilities ? res.data.capabilities.canAddChildren : true,
      };
    } catch (err) {
      return {
        success: false,
        configured: true,
        message: err.message,
        hint: err.message.includes('File not found')
          ? 'Folder ID not found. Ensure the folder is shared with the Service Account email with Editor permission.'
          : undefined,
      };
    }
  }
}

module.exports = new GoogleDriveService();
