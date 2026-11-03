const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure destination directory exists (use /tmp on serverless environments like Vercel)
const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel
  ? path.join('/tmp', 'uploads', 'quick-print')
  : path.join(__dirname, '../../public/uploads/quick-print');

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('Warning: Could not create upload directory:', err.message);
}

// Storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (e) {
      // ignore
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique name: timestamp-random-sanitizedName
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 30);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

// Allowed file types
const allowedExtensions = [
  // Images
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.tif', '.tiff', '.heic', '.heif',
  // Documents & PDFs
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) || file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  return cb(new Error(`File type ${ext} is not supported. Please upload an image, PDF, or common document.`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 10, // Max 10 files per submission
  },
});

// Bank Payment Slip Storage & Upload
const slipUploadDir = isVercel
  ? path.join('/tmp', 'uploads', 'slips')
  : path.join(__dirname, '../../public/uploads/slips');

try {
  if (!fs.existsSync(slipUploadDir)) {
    fs.mkdirSync(slipUploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('Warning: Could not create slip upload directory:', err.message);
}

const slipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(slipUploadDir)) {
        fs.mkdirSync(slipUploadDir, { recursive: true });
      }
    } catch (e) {}
    cb(null, slipUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 20);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `slip_${baseName}_${uniqueSuffix}${ext}`);
  },
});

const slipFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.heic', '.heif'];
  if (allowed.includes(ext) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    return cb(null, true);
  }
  return cb(new Error('Bank slip must be an image (JPG, PNG, WEBP) or PDF file.'));
};

const uploadSlip = multer({
  storage: slipStorage,
  fileFilter: slipFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

module.exports = {
  uploadQuickPrint: upload.array('files', 10),
  uploadPaymentSlip: uploadSlip.single('slipFile'),
  uploadDir,
  slipUploadDir,
};
