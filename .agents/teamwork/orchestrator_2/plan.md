# Execution Plan: Milestone 5 (Admin Dashboard)

## Goal
Implement a fully functional, protected Admin Dashboard UI matching the existing dark-mode glassmorphism design for VelvetAura, backed by secure role-checked API endpoints.

## Requirements
1. Protected route only accessible to users with `role: admin`.
2. Product Management: View product list, add new product, edit existing product, delete product.
3. Order Management: View all customer orders across users, update order statuses (e.g. pending, processing, shipped, delivered, cancelled).
4. Main Navbar link: "Admin Dashboard" appearing only when an authenticated user has `role: admin`.
5. Seamless dark-mode glassmorphism UI matching design tokens and existing components.
6. Comprehensive test coverage (unit/API + UI integration).

## Execution Steps
1. **Phase 1: Exploration & Technical Discovery**
   - Dispatch 3 Explorers in parallel to investigate:
     - Explorer 1: Backend architecture (`src/routes`, `src/controllers`, `src/models`, `src/middlewares`, existing admin role handling, seed user `admin@velvetaura.com`).
     - Explorer 2: Frontend architecture (`public/js/store.js`, `public/js/app.js`, `public/js/components/navbar.js`, routing, modals/views, design tokens).
     - Explorer 3: Test infrastructure, existing test suites (`tests/`), and test strategy for admin endpoints & UI workflows.
   - Aggregate findings into `SCOPE.md`.

2. **Phase 2: Implementation (Worker)**
   - Dispatch Worker to implement:
     - Backend: Ensure `admin` role authorization middleware, product CRUD endpoints (`POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`), order listing & status update endpoints (`GET /api/orders`, `PUT /api/orders/:id/status` or equivalent), robust validation & security.
     - Frontend: Protected admin route (`#/admin`), Admin Dashboard component with product management tab/modal (create, edit, delete, table/cards) and order management tab/status updater, navbar "Admin Dashboard" link conditioned on admin auth role, dark-mode glassmorphism styling.
     - Tests: Automated test suite for admin endpoints and workflows (`tests/admin.test.js`).
     - Execute tests and verify zero regressions across existing test suite.

3. **Phase 3: Independent Review (Reviewers)**
   - Dispatch 2 independent Reviewers to review correctness, security, interface conformance, styling parity, and test coverage.

4. **Phase 4: Adversarial Verification (Challengers)**
   - Dispatch 2 Challengers to probe edge cases: unauthorized non-admin access attempts, malformed inputs, concurrency issues, edge-case order status transitions.

5. **Phase 5: Forensic Integrity Audit (Auditor)**
   - Dispatch Forensic Auditor to inspect for genuine implementation (no hardcoded mocks, no bypasses).

6. **Phase 6: Gate & Final Delivery**
   - Evaluate all verdicts in `GATE_STATUS.md`.
   - Pass unconditionally if all criteria met.
   - Send completion report and handoff to Sentinel.
