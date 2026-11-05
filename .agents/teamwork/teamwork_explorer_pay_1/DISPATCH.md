# DISPATCH — Frontend Currency & Checkout Explorer

## Timestamp
2026-11-05T08:53:00Z

## Role
teamwork_explorer

## Working Directory
g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_1\

## Original Request File
g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md

## Scope & Instructions
Investigate the codebase for:
1. Primary Currency (LKR) across the frontend:
   - Identify all places where currency is displayed, formatted, or calculated (`$`, `USD`, `price`, shipping, tax) in `public/js/` and HTML templates.
   - Design standard formatting helper (e.g. `Rs. X,XXX.XX` or `LKR X,XXX.XX`) and where to centralize it.
2. Checkout Payment Options (Replacing Mock Card Payment):
   - Locate existing mock credit card UI in `public/js/components/checkoutModal.js` and associated styles in `public/css/`.
   - Design replacement UI for:
     a) Cash on Delivery (COD)
     b) Direct Bank Transfer (display official bank details: Bank Name, Branch, Account Name, Account Number + confirmation checkbox)
   - Ensure dark-mode glassmorphism styling for payment selector cards and bank details.
3. Admin & User Account Order Displays:
   - Inspect `public/js/components/adminDashboard.js` and `public/js/components/userProfile.js` to ensure paymentMethod and paymentStatus are prominently and beautifully displayed.

Produce a detailed report in `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_1\handoff.md`.
