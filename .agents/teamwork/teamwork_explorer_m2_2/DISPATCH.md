# DISPATCH — Milestone 2 Explorer 2: Cart Management API & Pricing Engine

## Objective
Analyze and plan the implementation for VelvetAura's Cart service:
1. `src/controllers/cartController.js` and `src/routes/cartRoutes.js`:
   - `GET /api/cart`: Fetch active cart for authenticated user (via `protect` middleware). If no cart exists, auto-create one.
   - `POST /api/cart/items`: Add line item (`productId`, `quantity`). Validate item exists, validate `quantity <= product.stock`, increment quantity if item already in cart, and call `recalculateTotals()`.
   - `PUT /api/cart/items/:productId`: Update quantity. If `quantity === 0`, remove item; if `quantity > product.stock`, return 400 Bad Request. Call `recalculateTotals()`.
   - `DELETE /api/cart/items/:productId`: Remove item from cart, call `recalculateTotals()`.
   - `DELETE /api/cart`: Clear all items from cart, reset totals to zero.
2. Pricing formula integration: Subtotal sum(price * qty), 8% tax, free shipping >= $50.00 ($5.99 below, $0 if empty), grand total.
3. Concurrency and data integrity considerations.

## Scope Boundaries
- Read-only analysis and architecture planning.
- DO NOT write implementation code directly.
- Deliver findings in `analysis.md` and `handoff.md`.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_2\`

## Completion Criteria
- Comprehensive blueprint with controller code templates, Mongoose update operations, and response payloads.
- Complete `handoff.md` and notify parent.


## 2026-11-04T11:57:15Z
You are teamwork_explorer_m2_2.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_2\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_2\DISPATCH.md, g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md, and g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Plan the implementation of:
- Cart management APIs (src/controllers/cartController.js, src/routes/cartRoutes.js)
- Adding, updating, removing items, clearing cart
- Stock validation against available product inventory
- Pricing calculation rules (8% tax, free shipping >= $50, $5.99 below, grand total)
Deliver analysis.md and a self-contained handoff.md, and notify your parent.
