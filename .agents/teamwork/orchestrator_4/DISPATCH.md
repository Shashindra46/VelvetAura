# Dispatch — Checkout & Payment System Update (LKR Currency, COD, Bank Transfer, PayHere Prep)

## Timestamp
2026-11-05T08:50:00Z

## Request (verbatim)
Please update the checkout and payment system for VelvetAura with the following requirements:

1. Currency Update (LKR):
   - Support Sri Lankan Rupees (LKR / "Rs." / "LKR") as the primary currency across the entire application (catalog, cart drawer, checkout modal, order confirmation, user account orders, and admin dashboard). Ensure formatting (e.g. `Rs. X,XXX.XX` or `LKR X,XXX.XX`) and shipping/tax calculations align properly.

2. New Checkout Payment Options (Replacing Mock Card Payment):
   - Remove the previous mock card payment UI and payment simulation.
   - Implement two checkout payment methods:
     a) Cash on Delivery (COD): Standard COD flow where order is placed with payment status pending/unpaid upon delivery.
     b) Direct Bank Transfer: Display VelvetAura's official bank account details (Bank Name, Branch, Account Name, Account Number) within the checkout modal and require user confirmation of the transfer before placing the order.
   - Keep dark-mode glassmorphism styling consistent for the new payment option selectors and bank detail cards.

3. PayHere Architecture & Models Preparation:
   - Prepare the backend architecture, services, and models for future real-time LKR card processing via the PayHere payment gateway.
   - Update `Order` model schema to support payment methods (`'cod'`, `'bank_transfer'`, `'payhere'`), payment status (`'pending'`, `'paid'`, `'failed'`), and gateway transaction/hash fields.
   - Implement a PayHere service/utility module (e.g. hash generation helper using merchant secret, sandbox configuration from env vars, and webhook/notify handler endpoint structure).

4. Admin & Verification:
   - Ensure the Admin Dashboard orders table and user order history display the selected payment method and payment status clearly.
   - Update and maintain automated unit/integration/E2E test suites to verify COD, Bank Transfer, currency formatting, and PayHere utility functionality.

## Working Directory
`g:\VelvetAura\.agents\teamwork\orchestrator_4\`

## Project Root
`g:\VelvetAura\`
