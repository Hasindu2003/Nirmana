const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

class GoogleDriveService {
  constructor() {
    this.driveClient = null;
    this.authClient = null;
  }

  /**
   * Parse credentials from environment variables and local secret files.
   * Supports:
   * 1. OAuth2 (Personal Gmail Account with 15GB quota):
   *    - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
   *    - Auto-reads client_secret_*.json if present
   * 2. Service Account (Google Workspace / Shared Drives):
   *    - GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
   */
  getCredentials() {
    let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

    const rootDir = path.join(__dirname, '../../');

    // Auto-detect local client_secret_*.json if in root
    try {
      const files = fs.readdirSync(rootDir);
      const oauthSecretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
      if (oauthSecretFile) {
        const secretContent = JSON.parse(fs.readFileSync(path.join(rootDir, oauthSecretFile), 'utf8'));
        const appData = secretContent.web || secretContent.installed;
        if (appData) {
          clientId = clientId || appData.client_id;
          clientSecret = clientSecret || appData.client_secret;
        }
      }
    } catch (e) {}

    // Auto-detect local service account JSON if in root
    try {
      const files = fs.readdirSync(rootDir);
      const autoKey = files.find(f => f.startsWith('nirmana-printing-') && f.endsWith('.json'));
      if (autoKey) {
        const fileContent = JSON.parse(fs.readFileSync(path.join(rootDir, autoKey), 'utf8'));
        clientEmail = clientEmail || fileContent.client_email;
        privateKey = privateKey || fileContent.private_key;
      }
    } catch (e) {}

    // Check if whole OAuth client secret JSON is passed in env
    if (process.env.GOOGLE_CLIENT_SECRET_JSON) {
      try {
        const parsed = typeof process.env.GOOGLE_CLIENT_SECRET_JSON === 'string'
          ? JSON.parse(process.env.GOOGLE_CLIENT_SECRET_JSON)
          : process.env.GOOGLE_CLIENT_SECRET_JSON;
        const appData = parsed.web || parsed.installed || parsed;
        if (appData) {
          clientId = clientId || appData.client_id;
          clientSecret = clientSecret || appData.client_secret;
        }
      } catch (err) {
        console.warn('Warning: Could not parse GOOGLE_CLIENT_SECRET_JSON:', err.message);
      }
    }

    // Check if whole JSON string is passed in GOOGLE_SERVICE_ACCOUNT_KEY
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
      folderId,
      // OAuth2 fields
      clientId,
      clientSecret,
      refreshToken,
      redirectUri,
      // Service account fields
      clientEmail,
      privateKey,
    };
  }

  /**
   * Check if Google Drive storage is fully configured
   */
  isConfigured() {
    const creds = this.getCredentials();
    if (!creds.folderId) return false;

    // Mode 1: OAuth2 with personal Gmail (has quota)
    if (creds.clientId && creds.clientSecret && creds.refreshToken) {
      return true;
    }

    // Mode 2: Service Account (Workspace / Shared Drive)
    if (creds.clientEmail && creds.privateKey) {
      return true;
    }

    return false;
  }

  /**
   * Generate Google OAuth authorization URL for the user to log in
   * @param {string} [customRedirectUri] - Optional custom redirect URI (e.g. from request host)
   */
  generateAuthUrl(customRedirectUri) {
    const creds = this.getCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Google OAuth Client ID & Secret are required to generate auth URL.');
    }

    const redirectUri = customRedirectUri || creds.redirectUri;

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }

  /**
   * Exchange authorization code from Google for tokens
   * @param {string} code - Google OAuth authorization code
   * @param {string} [customRedirectUri] - Optional matching redirect URI used in auth request
   */
  async exchangeCodeForTokens(code, customRedirectUri) {
    const creds = this.getCredentials();
    const redirectUri = customRedirectUri || creds.redirectUri;
    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Initialize and return authenticated Google Drive API client
   */
  getClient() {
    if (this.driveClient) return this.driveClient;

    const creds = this.getCredentials();

    // 1. Prefer OAuth2 (allows uploads under user's 15GB personal quota)
    if (creds.clientId && creds.clientSecret && creds.refreshToken) {
      const oauth2Client = new google.auth.OAuth2(
        creds.clientId,
        creds.clientSecret,
        creds.redirectUri
      );
      oauth2Client.setCredentials({ refresh_token: creds.refreshToken });
      this.authClient = oauth2Client;
      this.driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      return this.driveClient;
    }

    // 2. Service Account Fallback (Google Workspace / Shared Drives)
    if (creds.clientEmail && creds.privateKey) {
      this.authClient = new google.auth.JWT({
        email: creds.clientEmail,
        key: creds.privateKey,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      this.driveClient = google.drive({
        version: 'v3',
        auth: this.authClient,
      });

      return this.driveClient;
    }

    throw new Error('Google Drive credentials (OAuth refresh token or Service Account key) are missing.');
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
      supportsAllDrives: true,
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
        supportsAllDrives: true,
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
   * Create a resumable upload session on Google Drive.
   * Allows uploading large files (10MB, 50MB+) directly or in chunks,
   * bypassing Vercel's 4.5MB serverless payload limit completely!
   * @param {string} filename - Display filename in Drive
   * @param {string} mimeType - File MIME type
   * @param {number} fileSize - File size in bytes
   * @param {string} description - Optional description
   * @returns {Promise<string>} sessionUrl - Google Drive resumable session URI
   */
  async createResumableSession(filename, mimeType, fileSize, description = '') {
    if (!this.isConfigured()) {
      throw new Error('Google Drive is not configured.');
    }
    const { folderId } = this.getCredentials();
    this.getClient(); // Ensure authClient is initialized

    const metadata = {
      name: filename,
      parents: [folderId],
      description: description || 'Direct customer upload via Nirmana Printing',
    };

    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream',
    };

    if (fileSize) {
      headers['X-Upload-Content-Length'] = fileSize.toString();
    }

    const response = await this.authClient.request({
      method: 'POST',
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      headers,
      data: metadata,
    });

    const sessionUrl = response.headers.location || (response.headers && response.headers['location']);
    if (!sessionUrl) {
      throw new Error('Google Drive did not return a resumable session URI.');
    }

    return sessionUrl;
  }

  /**
   * Finalize a file uploaded directly to Google Drive.
   * Sets public read permission and retrieves drive view/download links.
   * @param {string} fileId - Google Drive file ID
   */
  async finalizeDriveFile(fileId) {
    const drive = this.getClient();

    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      console.warn('Could not set public read permission on Google Drive file:', permErr.message);
    }

    const res = await drive.files.get({
      fileId,
      fields: 'id, name, webViewLink, webContentLink, size, mimeType',
      supportsAllDrives: true,
    });

    const fileData = res.data;
    return {
      id: fileData.id,
      name: fileData.name,
      webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
      webContentLink: fileData.webContentLink || `https://drive.google.com/uc?id=${fileData.id}&export=download`,
      fileSize: fileData.size ? parseInt(fileData.size, 10) : null,
      mimeType: fileData.mimeType,
    };
  }

  /**
   * Stream a file directly from Google Drive (for in-app preview / download)
   * @param {string} fileId - Google Drive file ID
   */
  async getFileStream(fileId) {
    const drive = this.getClient();
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
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
      await drive.files.delete({ fileId, supportsAllDrives: true });
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
        message: 'Google Drive environment variables are not set or incomplete.',
      };
    }

    try {
      const { folderId } = this.getCredentials();
      const drive = this.getClient();
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, capabilities, shared',
        supportsAllDrives: true,
      });

      return {
        success: true,
        configured: true,
        folderName: res.data.name,
        folderId: res.data.id,
        canAddChildren: res.data.capabilities ? res.data.capabilities.canAddChildren : true,
      };
    } catch (err) {
      return {
        success: false,
        configured: true,
        message: err.message,
        hint: err.message.includes('File not found')
          ? 'Folder ID not found. Ensure the folder is shared with the service account or accessible by your OAuth account.'
          : undefined,
      };
    }
  }
}

module.exports = new GoogleDriveService();
