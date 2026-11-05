const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Resolve target storage directory
const uploadDir = path.resolve(__dirname, '../../public/assets/images/products');

// Ensure destination directory exists on startup
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk storage configuration with safe unique filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFilename = `prod-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeFilename);
  },
});

// Strict MIME and extension whitelist filter
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// 5 MB file size limit
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Middleware wrapper for standardized JSON error handling
const handleUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError || (err && err.name === 'MulterError')) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size exceeds 5MB limit',
            error: 'LIMIT_FILE_SIZE',
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected upload field "${err.field}". Form field must be "image"`,
            error: 'LIMIT_UNEXPECTED_FILE',
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message,
          error: err.code || 'MULTER_ERROR',
        });
      }

      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          message: err.message,
          error: 'INVALID_FILE_TYPE',
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error',
        error: err.code || 'UPLOAD_ERROR',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded. Please provide an image file under key "image".',
        error: 'FILE_MISSING',
      });
    }

    next();
  });
};

module.exports = {
  upload,
  handleUpload,
  uploadProductImageMiddleware: handleUpload,
  uploadDir,
};
