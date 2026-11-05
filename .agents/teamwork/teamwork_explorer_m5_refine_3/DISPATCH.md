# Explorer 3 Dispatch: Frontend File Upload UI & State Integration

## Context
Original Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
Scope: `g:\VelvetAura\.agents\teamwork\orchestrator_3\SCOPE.md`
Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\`

## Objective
Investigate the frontend implementation for product image management in the Admin Panel.
Examine:
- `public/js/components/adminDashboard.js`: Inspect how the "Edit Product" and "Add Product" modals are constructed, specifically the current "Hero Image URL" (`#edit-product-image`, `#add-product-image`) inputs.
- Inspect how form submission currently gathers data and validates product fields.
- Design the replacement:
  - File upload input/button (`<input type="file" accept="image/*">` with styled glassmorphism button).
  - Ability to display current image thumbnail/preview.
  - Ability to remove existing image (clear preview and reset image value).
  - Ability to select a new image file and either upload immediately or upload upon form submission, updating the product's `image` field.
  - Consistent UX across both "Edit Product" and "Add Product" forms.
- Inspect `public/js/api.js` for adding `uploadProductImage(formData)` or similar endpoint.
- Inspect `public/js/store.js` for any relevant state actions or helpers.

Write your findings to `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\handoff.md`.


## 2026-11-05T05:57:54Z
Read ORIGINAL_REQUEST.md at g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md and DISPATCH.md at g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\DISPATCH.md.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\.
Investigate the frontend product forms in the Admin Dashboard: public/js/components/adminDashboard.js, public/js/api.js, public/js/store.js.
Find where the text input for 'Hero Image URL' is currently rendered in Edit Product and Add Product modals.
Design a modern glassmorphism file upload UI that allows admins to:
1) View the current or newly selected image preview with proper aspect ratio.
2) Click a styled upload button or drop a file to select an image.
3) Remove/clear the current image.
4) Handle file upload to backend (via api.js/store.js) either immediately on selection or during form submission.
5) Maintain complete consistency between Edit Product and Add Product forms.
Write a thorough handoff report to g:\VelvetAura\.agents\teamwork\teamwork_explorer_m5_refine_3\handoff.md and notify me when complete.
