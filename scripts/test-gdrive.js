const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const googleDriveService = require('../src/services/googleDriveService');

async function runTest() {
  console.log('====================================================');
  console.log('🔍 Testing Google Drive Cloud Storage Integration');
  console.log('====================================================\n');

  console.log('1. Checking Authentication Mode:');
  const creds = googleDriveService.getCredentials();
  if (creds.clientId && creds.clientSecret && creds.refreshToken) {
    console.log('   - Mode:                     ✓ OAuth2 (Personal Account with 15GB Quota)');
    console.log('   - GOOGLE_CLIENT_ID:         ✓ Detected');
    console.log('   - GOOGLE_REFRESH_TOKEN:     ✓ Configured');
    console.log('   - GOOGLE_DRIVE_FOLDER_ID:  ', creds.folderId ? `✓ Set (${creds.folderId})` : '❌ Missing');
  } else {
    console.log('   - Mode:                     OAuth2 Personal Gmail Setup');
    console.log('   - GOOGLE_CLIENT_ID:        ', creds.clientId ? '✓ Detected' : '❌ Not set');
    console.log('   - GOOGLE_REFRESH_TOKEN:    ', creds.refreshToken ? '✓ Set' : '❌ Needs 1-time login');
    console.log('   - GOOGLE_DRIVE_FOLDER_ID:  ', creds.folderId ? `✓ Set (${creds.folderId})` : '❌ Missing');
  }

  if (!googleDriveService.isConfigured()) {
    console.log('\n❌ Google Drive needs 1-time authorization for your personal Gmail.');
    console.log('\n👉 To authorize:');
    console.log('1. In Google Cloud Console > Credentials, edit your OAuth 2.0 Client.');
    console.log('2. Under "Authorized redirect URIs", add:');
    console.log('   http://localhost:3000/oauth2callback');
    console.log('3. Open your browser and visit:');
    console.log('   http://localhost:3000/auth/google');
    console.log('\nLog in with your Gmail and click Allow. It will automatically save your token!');
    process.exit(1);
  }

  console.log('\n2. Testing Google Drive API Connection & Folder Access...');
  const verify = await googleDriveService.verifyConnection();
  if (!verify.success) {
    console.error('❌ Connection Failed:', verify.message);
    if (verify.hint) {
      console.log('\n💡 Hint:', verify.hint);
    }
    process.exit(1);
  }

  console.log('✓ Successfully connected to Google Drive API!');
  console.log(`   - Connected Folder Name: "${verify.folderName}"`);
  console.log(`   - Connected Folder ID:   ${verify.folderId}`);
  console.log(`   - Write Permission:     ${verify.canAddChildren ? '✓ Permitted (Editor)' : '❌ Read-Only'}`);

  console.log('\n3. Testing End-to-End File Upload & Cleanup...');
  const tempTestFile = path.join(__dirname, 'test-upload.txt');
  fs.writeFileSync(tempTestFile, 'Nirmana Printing Cloud Storage Test - ' + new Date().toISOString());

  try {
    const uploadRes = await googleDriveService.uploadFile(
      tempTestFile,
      'test-nirmana-connection.txt',
      'text/plain',
      'Automated test file from Nirmana Printing'
    );
    console.log('✓ Test file uploaded successfully!');
    console.log(`   - File ID:   ${uploadRes.id}`);
    console.log(`   - View Link: ${uploadRes.webViewLink}`);

    console.log('\n4. Cleaning up test file from Google Drive...');
    await googleDriveService.deleteFile(uploadRes.id);
    console.log('✓ Test file deleted from Google Drive.');
  } finally {
    if (fs.existsSync(tempTestFile)) {
      fs.unlinkSync(tempTestFile);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 ALL TESTS PASSED! Google Drive storage is 100% ready.');
  console.log('====================================================\n');
}

runTest().catch((err) => {
  console.error('Unexpected error during test:', err);
  process.exit(1);
});
