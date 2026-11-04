const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config/config');

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  const { accessKeyId, secretAccessKey, endpoint, region } = config.neon.objectStorage;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  s3Client = new S3Client({
    region: region || 'ap-southeast-1',
    endpoint: endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for Neon Object Storage
  });

  return s3Client;
}

function isConfigured() {
  const { accessKeyId, secretAccessKey, endpoint } = config.neon.objectStorage;
  return Boolean(accessKeyId && secretAccessKey && endpoint);
}

/**
 * Upload a file Buffer directly to Neon Object Storage bucket
 */
async function uploadFile(key, buffer, contentType = 'application/octet-stream') {
  const client = getS3Client();
  if (!client) {
    throw new Error('Neon Object Storage is not configured (missing credentials or endpoint)');
  }

  const bucket = config.neon.objectStorage.bucket || 'assets';
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  // Generate a presigned URL valid for 24 hours (86400 seconds)
  const presignedUrl = await getPresignedUrl(key, 86400);

  return {
    key,
    bucket,
    presignedUrl,
    directUrl: `${config.neon.objectStorage.endpoint}/${bucket}/${key}`,
  };
}

/**
 * Get a temporary presigned URL for secure access
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  const client = getS3Client();
  if (!client) {
    throw new Error('Neon Object Storage is not configured');
  }

  const bucket = config.neon.objectStorage.bucket || 'assets';
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Check if an object exists in the bucket
 */
async function objectExists(key) {
  const client = getS3Client();
  if (!client) return false;
  try {
    const bucket = config.neon.objectStorage.bucket || 'assets';
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Delete an object from Neon Object Storage
 */
async function deleteFile(key) {
  const client = getS3Client();
  if (!client) return false;
  const bucket = config.neon.objectStorage.bucket || 'assets';
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

module.exports = {
  isConfigured,
  getS3Client,
  uploadFile,
  getPresignedUrl,
  objectExists,
  deleteFile,
};
