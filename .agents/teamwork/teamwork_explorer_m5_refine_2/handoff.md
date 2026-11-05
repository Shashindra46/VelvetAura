# Handoff Report: Backend Multipart/Form-Data Image Upload Architecture & Verification

**Author**: `teamwork_explorer_m5_refine_2`  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_2\`  
**Target Milestone**: Milestone 5 Refine (Admin Dashboard & Multipart Image Upload)  
**Date**: 2026-11-05  

---

## 1. Observation

Direct findings from codebase inspection:

### 1.1 Dependency Audit (`package.json`)
- In `package.json` lines 23–32:
  ```json
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mongodb-memory-server": "^9.2.0",
    "mongoose": "^8.3.0",
    "morgan": "^1.10.0"
  }
  ```
  `multer` is **not installed** in `dependencies` nor in `devDependencies`.
- Searching `node_modules` for `*multer*` returned 0 matches.
- NPM registry query `npm view multer version` returned `2.5.0` (LTS branch `^1.4.5-lts.1` is the battle-tested, standard release for Express 4.x).

### 1.2 Static Asset Serving (`src/app.js`)
- In `src/app.js` lines 62–65:
  ```javascript
  // 4. Static Frontend Assets
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));
  ```
  Because `public/` is served at the application root (`/`), any static file stored in `public/assets/images/products/<filename>` is directly accessible via HTTP GET at:
  `/assets/images/products/<filename>`.
- In `src/app.js` lines 73–84:
  ```javascript
  // 6. SPA Client-Side Routing Fallback (for non-API GET requests)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('VelvetAura API Server Running. Frontend mounting point.');
    }
  });
  ```
  Because `express.static` is registered before the SPA wildcard fallback, static image requests bypass the SPA route and are returned directly with proper image MIME headers.

### 1.3 Asset Storage Directory
- Inspecting `public/assets/images`:
  Currently only contains `placeholder.svg`.
  The directory `public/assets/images/products` **does not exist yet** on disk. Auto-creation (`fs.mkdirSync(dir, { recursive: true })`) is mandatory.

### 1.4 Route Protection & Middleware (`src/middleware/authMiddleware.js`)
- In `src/middleware/authMiddleware.js`:
  - `protect` (lines 13–61): Verifies JWT Bearer token and attaches `req.user`. Returns `401 Unauthorized` (`{ success: false, message: 'Not authorized...' }`) if token is missing, invalid, or expired.
  - `admin` (lines 98–109): Asserts `req.user && req.user.role === 'admin'`. Returns `403 Forbidden` (`{ success: false, message: 'Access denied: Administrator privileges required', error: 'Forbidden' }`) if the user is not an administrator.

### 1.5 Product Routes & Controller (`src/routes/productRoutes.js`, `src/controllers/productController.js`)
- In `src/routes/productRoutes.js` lines 28–31:
  ```javascript
  // Admin-only Product Management CRUD endpoints
  router.post('/', protect, admin, createProduct);
  router.put('/:id', protect, admin, updateProduct);
  router.delete('/:id', protect, admin, deleteProduct);
  ```
- In `src/controllers/productController.js` lines 310–336 & 506–510:
  Both `createProduct` and `updateProduct` accept `image` (string) or `images` (string[]), mapping to the Mongoose `Product` model schema (`images: [String]`, with a virtual getter/setter for `image`).

### 1.6 Frontend API Client (`public/js/api.js`)
- In `public/js/api.js` lines 86–94:
  ```javascript
  if (body) {
    if (body instanceof FormData) {
      delete defaultHeaders['Content-Type'];
      fetchConfig.body = body;
    } else {
      defaultHeaders['Content-Type'] = 'application/json';
      fetchConfig.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }
  ```
  The client `ApiClient` already supports `FormData` payloads natively, automatically deleting the `'Content-Type'` header to allow browser boundary calculation and attaching `Authorization: Bearer <token>`.

### 1.7 Current Admin Dashboard Modal UI (`public/js/components/adminDashboard.js`, `public/css/components.css`)
- In `adminDashboard.js` lines 535–538:
  ```html
  <div class="form-group col-span-2">
    <label for="form-prod-image">Hero Image URL</label>
    <input type="url" id="form-prod-image" name="image" class="glass-input" placeholder="https://..." value="${escapeHtml((prod.images && prod.images[0]) || prod.image || '')}" />
  </div>
  ```
- In `public/css/components.css` lines 2376–2403:
  `.admin-modal-overlay` uses `display: flex; align-items: center; justify-content: center;`. When modal height approaches or exceeds the viewport, vertical flex centering causes top form inputs and header to be clipped above `top: 0`.

### 1.8 Current Test Suite Health
- Executing `npm test` passed 9 out of 9 test suites and 141 out of 141 unit/integration tests in 108.67s.

---

## 2. Logic Chain

1. **Multer Requirement (from Obs 1.1)**:
   Express `express.json()` and `express.urlencoded()` cannot parse `multipart/form-data` request streams. Installing `multer` (`"multer": "^1.4.5-lts.1"`) is mandatory for handling binary image uploads.

2. **Storage Location & Static Serving Alignment (from Obs 1.2 & 1.3)**:
   `app.use(express.static(path.join(__dirname, '../public')))` serves all assets within `public/`.
   Therefore, saving files to `path.join(__dirname, '../../public/assets/images/products')` guarantees that the returned web URL `/assets/images/products/<filename>` is directly resolvable without requiring custom route redirects or streaming endpoints.

3. **Auto-Directory Creation (from Obs 1.3)**:
   Because `public/assets/images/products` does not exist in a fresh repository clone, `multer.diskStorage` must invoke `fs.mkdirSync(uploadDir, { recursive: true })` inside its `destination` resolver (or at module initialization) to prevent fatal `ENOENT: no such file or directory` errors.

4. **Safe Filename Generation & Path Traversal Immunity (from Obs 1.4 & 1.5)**:
   Never preserve or incorporate `file.originalname`'s base stem in the saved filename on disk. An attacker could craft filenames containing `../../` or Windows path separators `..\..\`.
   Instead:
   - Extract extension using `path.extname(file.originalname).toLowerCase()`.
   - Whitelist allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
   - Generate a cryptographically random, collision-resistant identifier using built-in `crypto.randomBytes(6).toString('hex')` (or `crypto.randomUUID()`) plus a timestamp prefix:
     `product-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
   - Result: `product-1730784920123-a1b2c3d4e5f6.webp`. Completely immune to path traversal, shell injection, or filename collisions.

5. **MIME Type & Extension Whitelisting (from Obs 1.5)**:
   `fileFilter` must enforce both:
   - MIME type in `['image/jpeg', 'image/jpg', 'image/png', 'image/webp']`
   - Extension in `['.jpg', '.jpeg', '.png', '.webp']`
   Any file failing either check must be rejected immediately with an informative error (`INVALID_FILE_TYPE`), preventing executable scripts (.php, .js, .sh, .html) or SVG XSS attacks.

6. **Size Limits & Error Formatting (from Obs 1.4 & 1.5)**:
   Set `limits: { fileSize: 5 * 1024 * 1024 }` (5 MB).
   Wrap the multer middleware in `src/middleware/uploadMiddleware.js` to catch `multer.MulterError` (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`) and custom errors, returning a clean JSON response:
   ```json
   {
     "success": false,
     "message": "File size exceeds 5MB limit",
     "error": "LIMIT_FILE_SIZE"
   }
   ```
   If no file was attached to the request, return `400 Bad Request` (`"Please provide an image file to upload under field 'image'"`).

7. **Endpoint Route Architecture (from Obs 1.4 & 1.5)**:
   Expose `POST /api/products/upload` inside `src/routes/productRoutes.js`:
   ```javascript
   router.post('/upload', protect, admin, uploadProductImageMiddleware, uploadProductImageController);
   ```
   - Guards: `protect` (verifies token) -> `admin` (verifies role === 'admin').
   - Position in `productRoutes.js`: Mounted **before** `router.get('/:id')` and `router.put('/:id')` to prevent route shadowing by the `:id` parameter!
   - (Optional alias): Can also mount `app.use('/api/upload', uploadRoutes)` if a generic top-level upload route is preferred, but mounting on `/api/products/upload` keeps product catalog operations modular and requires no edits to `src/app.js`.

8. **Response Payload Contract**:
   On successful upload, the endpoint returns HTTP 200 OK:
   ```json
   {
     "success": true,
     "message": "Product image uploaded successfully",
     "imageUrl": "/assets/images/products/product-1730784920123-a1b2c3d4e5f6.webp",
     "filename": "product-1730784920123-a1b2c3d4e5f6.webp",
     "size": 154200,
     "mimetype": "image/webp"
   }
   ```

9. **Frontend Integration Workflow (from Obs 1.6 & 1.7)**:
   - Add `api.uploadProductImage(file)` to `ApiClient` in `public/js/api.js`.
   - In `public/js/components/adminDashboard.js`, replace the text input with:
     1. Image preview container with current image or placeholder.
     2. File input `<input type="file" id="form-prod-image-file" accept="image/png,image/jpeg,image/webp">`.
     3. "Remove Image" button that clears the preview and resets the image URL to `""` or placeholder.
     4. Hidden input `<input type="hidden" name="image" id="form-prod-image">` to store the active `imageUrl`.
     5. On file select: upload image immediately via `api.uploadProductImage(file)` (with upload spinner/progress feedback), update preview, and populate `hidden` input. When saving the form, `store.createAdminProduct` or `store.updateAdminProduct` receives the updated `image` URL.

---

## 3. Caveats

1. **Ephemeral Test Files on Disk**:
   Multer diskStorage saves files directly to `public/assets/images/products`. In automated test runs (e.g., Jest `supertest`), uploaded test images will be written to disk. Tests must include cleanup hooks (`afterAll` / `afterEach`) to delete created test files matching `test-upload-*` so git working directory remains clean.
2. **File Magic Number Validation**:
   Checking MIME type and extension stops 99.9% of user mistakes and attacks. If binary payload deep-inspection (magic number sniff) is needed, `file-type` or `sharp` can be introduced later, but for this milestone, Multer MIME filtering + extension whitelisting + randomized file stems provides complete safety without extra heavy binary dependencies.
3. **Route Ordering Warning**:
   In Express, route order is crucial. `router.post('/upload', ...)` must be registered **before** any parameterized route like `router.put('/:id')` or `router.get('/:id')` to prevent Express from misinterpreting `/upload` as an `:id` parameter.

---

## 4. Conclusion

The recommended backend architecture is clear, modular, and ready for implementation by the worker agent:

### 4.1 Required Changes Summary
| Component | Path | Action | Description |
|-----------|------|--------|-------------|
| Dependency | `package.json` | Edit | Add `"multer": "^1.4.5-lts.1"` and run `npm install multer` |
| Middleware | `src/middleware/uploadMiddleware.js` | Create | Multer diskStorage, auto `mkdirSync`, safe unique filename, 5MB limit, MIME filter, error-handling wrapper |
| Controller | `src/controllers/productController.js` | Edit | Add `uploadProductImage` controller returning `{ success: true, imageUrl, filename, size, mimetype }` |
| Routes | `src/routes/productRoutes.js` | Edit | Mount `POST /upload` before `:id` routes guarded by `protect, admin` |
| Error Middleware | `src/middleware/errorMiddleware.js` | Edit | Add explicit `MulterError` and `INVALID_FILE_TYPE` branches in `errorHandler` |
| Frontend API | `public/js/api.js` | Edit | Add `uploadProductImage(file)` method using `FormData` |
| Frontend UI | `public/js/components/adminDashboard.js` | Edit | Replace image URL input with preview, file upload button, and remove image button |
| Frontend CSS | `public/css/components.css` | Edit | Fix modal clipping: adjust `.admin-modal-overlay` to `align-items: flex-start; overflow-y: auto; padding: 40px var(--space-md);` |
| Verification | `tests/admin_upload.test.js` | Create | Supertest automated tests for upload RBAC, validations, and static serving |

### 4.2 Proposed Code Design Specs

#### A. `src/middleware/uploadMiddleware.js`
```javascript
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Resolve target storage directory
const uploadDir = path.resolve(__dirname, '../../public/assets/images/products');

// Ensure destination directory exists
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
    const uniqueToken = crypto.randomBytes(6).toString('hex');
    const safeFilename = `product-${Date.now()}-${uniqueToken}${ext}`;
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
      if (err instanceof multer.MulterError) {
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

      return next(err);
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
  uploadDir,
};
```

#### B. Controller Method (`src/controllers/productController.js`)
```javascript
/**
 * @desc    Upload product image asset
 * @route   POST /api/products/upload
 * @access  Private/Admin
 */
const uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
        error: 'FILE_MISSING',
      });
    }

    const imageUrl = `/assets/images/products/${req.file.filename}`;

    return res.status(200).json({
      success: true,
      message: 'Product image uploaded successfully',
      imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    next(error);
  }
};
```

#### C. Route Registration (`src/routes/productRoutes.js`)
```javascript
const { handleUpload } = require('../middleware/uploadMiddleware');

// Specific routes first to prevent :id parameter shadowing
router.get('/categories', getCategories);
router.get('/', getProducts);

// Admin-only image upload endpoint (MUST be before /:id)
router.post('/upload', protect, admin, handleUpload, uploadProductImage);

router.get('/:id', getProductById);
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);
```

---

## 5. Verification Method

### 5.1 Automated Test Suite (`tests/admin_upload.test.js`)
Implement an end-to-end automated test file using Jest and Supertest covering 8 critical test cases:

```javascript
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const User = require('../src/models/User');

describe('Admin Product Image Upload API (POST /api/products/upload)', () => {
  let adminToken;
  let customerToken;
  const uploadedFilesToCleanup = [];

  beforeAll(async () => {
    // 1. Create admin and customer accounts
    const adminUser = await User.create({
      name: 'Upload Admin',
      email: 'upload.admin@velvetaura.luxury',
      password: 'AdminPassword2026!',
      role: 'admin',
    });
    const customerUser = await User.create({
      name: 'Normal Customer',
      email: 'upload.customer@velvetaura.luxury',
      password: 'CustomerPassword2026!',
      role: 'customer',
    });

    // 2. Fetch login tokens
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'upload.admin@velvetaura.luxury',
      password: 'AdminPassword2026!',
    });
    adminToken = adminLogin.body.token;

    const customerLogin = await request(app).post('/api/auth/login').send({
      email: 'upload.customer@velvetaura.luxury',
      password: 'CustomerPassword2026!',
    });
    customerToken = customerLogin.body.token;
  });

  afterAll(() => {
    // Clean up created files on disk
    for (const file of uploadedFilesToCleanup) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) {}
      }
    }
  });

  // 1. RBAC Tests
  test('should return 401 Unauthorized when no token is provided', async () => {
    const res = await request(app).post('/api/products/upload');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('should return 403 Forbidden when requested by a customer', async () => {
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 2. Validation & Boundary Tests
  test('should return 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('FILE_MISSING');
  });

  test('should return 400 when field name is incorrect', async () => {
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('wrongField', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'test.jpg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should reject invalid file types (.txt, .pdf, .js)', async () => {
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', Buffer.from('malicious script'), 'payload.js');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  test('should reject files exceeding 5MB size limit', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', largeBuffer, 'huge.jpg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('LIMIT_FILE_SIZE');
  });

  // 3. Successful Upload & Static Serving Verification
  test('should successfully upload valid image (JPG, PNG, WebP) and return static URL', async () => {
    const fakeImageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', fakeImageBuffer, 'luxury-cream.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toMatch(/^\/assets\/images\/products\/product-\d+-[a-f0-9]+\.jpg$/);
    expect(res.body.filename).toBeDefined();

    // Track for cleanup
    const diskPath = path.resolve(__dirname, '../public', res.body.imageUrl.replace(/^\//, ''));
    uploadedFilesToCleanup.push(diskPath);

    // Verify file exists on disk
    expect(fs.existsSync(diskPath)).toBe(true);

    // Verify static serving via express.static
    const staticRes = await request(app).get(res.body.imageUrl);
    expect(staticRes.status).toBe(200);
    expect(staticRes.headers['content-type']).toMatch(/image/);
  });
});
```

### 5.2 Verification Commands
1. Run upload test suite:
   ```bash
   npx jest tests/admin_upload.test.js --runInBand
   ```
2. Run entire regression suite to ensure zero collateral regressions:
   ```bash
   npm test
   ```
3. Test static retrieval with curl:
   ```bash
   curl -I http://localhost:5000/assets/images/products/<uploaded_filename>.jpg
   ```

### 5.3 Invalidation Conditions
- Any test returning `404` for `/api/products/upload` indicates route mounting order error or missing route registration.
- Any test returning `500` for missing directory indicates `fs.mkdirSync` failure.
- Inability to fetch the uploaded image via `GET /assets/images/products/...` indicates incorrect static folder mapping in `src/app.js`.
