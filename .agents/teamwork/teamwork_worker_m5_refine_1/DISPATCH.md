# Worker Dispatch: Admin Panel Refinement (Modal Layout & Multipart Image Upload)

## Context
- Original User Intent: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Scope Document: `g:\VelvetAura\.agents\teamwork\orchestrator_3\SCOPE.md`
- Explorer 1 Report (Modal CSS): `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_1\handoff.md`
- Explorer 2 Report (Backend Multer): `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_2\handoff.md`
- Explorer 3 Report (Frontend UI): `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\handoff.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_worker_m5_refine_1\`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership Boundaries
You have exclusive write ownership of:
- `package.json` (to add `multer`)
- `src/middleware/uploadMiddleware.js` (new)
- `src/routes/productRoutes.js` (add upload route)
- `src/controllers/productController.js` (upload handler)
- `public/css/components.css` (modal layout & image upload styling)
- `public/js/components/adminDashboard.js` (modal DOM & upload event handling)
- `public/js/api.js` (add `uploadProductImage`)
- `public/js/store.js` (if needed for upload actions)
- `tests/upload.test.js` or `tests/admin.test.js` (comprehensive upload & RBAC tests)
- `public/assets/images/products/` (directory creation)

## Implementation Instructions

### 1. Backend Multer & Upload Route
1. Install `multer` via `npm install multer@^1.4.5-lts.1`.
2. Create `src/middleware/uploadMiddleware.js`:
   - Destination directory: `public/assets/images/products` (auto-create with `mkdirSync({ recursive: true })` if not present).
   - Filename: Unique, safe filename: `prod-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`.
   - Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
   - MIME type filtering: only `image/jpeg`, `image/png`, `image/webp`. Rejects invalid types with 400 (`Invalid file type. Only JPEG, PNG, and WebP images are allowed.`).
   - File size limit: 5MB (`5 * 1024 * 1024`). Rejects oversized files with 400.
   - Clean error handling wrapper so Multer errors return standard JSON `{ success: false, message: ... }`.
3. In `src/routes/productRoutes.js` (and/or `src/controllers/productController.js`):
   - Add `POST /api/products/upload` guarded by `protect, admin, uploadProductImageMiddleware`.
   - Validate file exists in `req.file`. Return 400 if no file provided.
   - Return `{ success: true, imageUrl: '/assets/images/products/' + req.file.filename, message: 'Product image uploaded successfully' }`.
4. Verify static asset serving in `src/app.js` (`express.static(publicPath)`) serves `/assets/images/products/<filename>` with 200.

### 2. CSS Modal Layout Fix
In `public/css/components.css`:
1. `.admin-modal-overlay`:
   - Change `align-items: center` to `align-items: flex-start`.
   - Add `overflow-y: auto; overscroll-behavior: contain;`.
2. `.admin-modal-dialog`:
   - Add `margin: auto; display: flex; flex-direction: column;`.
   - `.admin-modal-dialog.admin-modal-lg`: `max-height: calc(100vh - 3rem); overflow: hidden;`.
3. Pinned Header:
   - `.admin-modal-header`: `flex-shrink: 0; padding: var(--space-lg) var(--space-xl); border-bottom: 1px solid var(--glass-border-subtle);`.
4. Independently Scrollable Body:
   - `.admin-modal-body`: `flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: var(--space-xl); overscroll-behavior: contain;`.
5. Pinned Footer:
   - `.admin-modal-footer`: `flex-shrink: 0; padding: var(--space-md) var(--space-xl); border-top: 1px solid var(--glass-border-subtle);`.
6. Responsive media query (`@media (max-width: 640px)`) ensuring modals fit small mobile viewports without any top cut-off.

### 3. Frontend Image Upload UI
In `public/js/components/adminDashboard.js`:
1. In `renderModal()` (used by both Edit Product and Add Product):
   - Replace the simple "Hero Image URL" input with a glassmorphism image upload widget:
     - 140x140 1:1 preview frame showing current image or placeholder.
     - Hidden `<input type="file" id="form-prod-file-input" accept="image/jpeg,image/png,image/webp" style="display:none" />`.
     - Hidden `<input type="hidden" id="form-prod-image" name="image" value="${escapeHtml(currentImage)}" />`.
     - "Upload Image" / "Choose File" button triggering the file dialog.
     - Dropzone area for dragging and dropping image files.
     - "Remove Image" button that clears the preview, sets image value to `""`, and resets file input.
     - Real-time status/feedback indicator (spinner during upload, success badge when saved).
2. Event Listeners:
   - Attach file change and drag/drop handlers.
   - When a file is selected/dropped, call `api.uploadProductImage(file)` (or via store).
   - Display instant local Blob URL or loading state, then set `#form-prod-image` value to the returned server URL upon success.
   - If remove button is clicked, reset image preview to placeholder and set `#form-prod-image` value to empty string.
   - Crucially: avoid full modal re-renders when uploading/removing images so typed inputs (name, price, etc.) are never wiped out!
3. Ensure consistency:
   - Both "Add Product" and "Edit Product" forms have identical styling, remove capability, and upload behavior.

### 4. Client API & Store
1. In `public/js/api.js`:
   - Implement `uploadProductImage(file)` creating `FormData`, appending `'image'`, and calling `POST /api/products/upload`.
2. In `public/js/store.js`:
   - Add `uploadProductImage(file)` action if desired for reactive tracking.

### 5. Automated Verification
1. Implement integration tests in `tests/upload.test.js`:
   - Upload with valid admin token -> 200/201, returns `imageUrl`.
   - Uploaded file exists on filesystem in `public/assets/images/products`.
   - Static asset GET `/assets/images/products/<filename>` returns 200 and image Content-Type.
   - Upload without token -> 401.
   - Upload with customer/non-admin token -> 403.
   - Upload with non-image file (e.g. .txt or .pdf) -> 400.
   - Upload with file exceeding 5MB -> 400.
   - Upload with no file attached -> 400.
2. Run `npm test` and `npm run test:e2e` to verify that 100% of all tests pass with zero regressions.
3. Write complete handoff report to `g:\VelvetAura\.agents\teamwork\teamwork_worker_m5_refine_1\handoff.md`.


## 2026-11-05T06:08:02Z
Read ORIGINAL_REQUEST.md at g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md and DISPATCH.md at g:\VelvetAura\.agents\teamwork\teamwork_worker_m5_refine_1\DISPATCH.md.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_worker_m5_refine_1\.
Implement the Admin Panel Refinement (modal layout fix & multipart image upload) per the detailed instructions in DISPATCH.md and the explorer handoff reports.
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
Run build/test verification (npm test and npm run test:e2e), write a complete handoff report to g:\VelvetAura\.agents\teamwork\teamwork_worker_m5_refine_1\handoff.md, and notify me when complete.
