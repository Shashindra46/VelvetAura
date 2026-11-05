# Dispatch — Admin Panel Form Layout & Image Upload (Milestone 5 Refinement)

## Timestamp
2026-11-05T05:55:00Z

## Request (verbatim)
Please fix two issues in the Admin Panel's Edit Product form:
1) Fix the CSS/layout issue where the top part of the form is cut off and not fully visible. Ensure modals are properly aligned, scrollable, and that header/top inputs are completely visible across various viewport heights.
2) Replace the simple "Hero Image URL" text input with a proper file upload button. Admins should be able to remove the existing image and upload a new image file directly. Update the backend to handle multipart/form-data for product image uploads (e.g. using multer or similar middleware) and save them to the correct assets directory (e.g., public/assets/images/products) with proper route protection, validation, and serving. Also ensure the "Add Product" form supports this or remains consistent.

## Working Directory
`g:\VelvetAura\.agents\teamwork\orchestrator_3\`

## Project Root
`g:\VelvetAura\`
