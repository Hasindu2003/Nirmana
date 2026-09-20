const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const googleDriveService = require('../src/services/googleDriveService');

async function runTest() {
  console.log('====================================================');
  console.log('🔍 Testing Google Drive Cloud Storage Integration');
  console.log('====================================================\n');

  console.log('1. Checking Environment Variables:');
  const { clientEmail, privateKey, folderId } = googleDriveService.getCredentials();
  console.log('   - GOOGLE_SERVICE_ACCOUNT_EMAIL:', clientEmail ? `✓ Set (${clientEmail})` : '❌ Missing');
  console.log('   - GOOGLE_PRIVATE_KEY:          ', privateKey ? '✓ Set (valid key detected)' : '❌ Missing');
  console.log('   - GOOGLE_DRIVE_FOLDER_ID:      ', folderId ? `✓ Set (${folderId})` : '❌ Missing');

  if (!googleDriveService.isConfigured()) {
    console.log('\n❌ Google Drive is NOT configured yet.');
    console.log('\nPlease add the following environment variables to your .env file:');
    console.log('GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"');
    console.log('GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
    console.log('GOOGLE_DRIVE_FOLDER_ID="your_google_drive_folder_id"');
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
