# Scope: VelvetAura Admin Panel Refinement (Modal Layout & Image Upload)

## Architecture
- **Frontend Presentation & Styling**:
  - `public/css/components.css`: Modal overlay, container, header, body, footer, responsive viewport constraints (`max-height: 90vh`, flexbox alignment, smooth scrolling, visible headers/top inputs).
  - `public/js/components/adminDashboard.js`: Modal rendering for Edit Product and Add Product forms; replace plain text hero image URL with file upload UI (dropzone/button, image preview, remove button, status).
  - `public/js/api.js`: Add multipart/form-data upload API method (e.g., `uploadProductImage(file)`).
  - `public/js/store.js`: Integration with admin actions for uploading product images during add/edit.
- **Backend Service & Routing**:
  - `src/middleware/uploadMiddleware.js` (or similar multer configuration): Multi-part file upload handler, MIME type validation (JPEG, PNG, WebP), file size limits, safe file naming.
  - `src/routes/uploadRoutes.js` or `src/routes/productRoutes.js`: Endpoint `POST /api/products/upload` (or `POST /api/upload`) guarded by `protect, admin`.
  - Static Asset Serving: Ensure Express correctly serves static files from `public/assets/images/products` or `public/`.
- **Testing**:
  - Unit/integration tests in `tests/upload.test.js` and/or `tests/admin.test.js`.
  - All existing unit (`npm test`) and E2E (`npm run test:e2e`) suites passing.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explorer Investigation | Investigate current modal CSS, existing multer/dependencies, backend routes, frontend forms | none | DONE |
| 2 | Worker Implementation | Implement CSS modal fixes, backend multer upload endpoint, static serving, frontend file upload UI, tests | M1 | DONE |
| 3 | Reviewer Verification | Independent verification of CSS layout, responsiveness, file upload flow, security | M2 | DONE |
| 4 | Challenger Stress Test | Edge cases (large files, invalid mimetypes, unauthenticated uploads, viewport sizes) | M2 | DONE |
| 5 | Forensic Audit | Integrity verification (no stubs, real file persistence, authentic multipart handling) | M2 | DONE |
| 6 | Gate Verdict & Handoff | Gate decision (strict AND) and final reporting | M3, M4, M5 | DONE |

## Interface Contracts
- **Upload Endpoint**:
  - `POST /api/products/upload` (or `POST /api/upload`)
  - Headers: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
  - Field: `image` (single file)
  - Success Response (200/201): `{ success: true, imageUrl: '/assets/images/products/<filename>', message: '...' }`
  - Error Response (400/401/403): `{ success: false, message: '...' }`
- **Frontend API**:
  - `api.uploadProductImage(fileFormData)` -> returns `{ success, imageUrl }`
- **Modal CSS Contract**:
  - Modal overlay centers modal dialog with proper padding/margins.
  - Modal container max-height `90vh` (or `calc(100vh - 4rem)`), display flex, flex-direction column.
  - Header is fixed/sticky at the top so it is never cut off.
  - Body is `overflow-y: auto`, ensuring all inputs are fully visible and accessible.
