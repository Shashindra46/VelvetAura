# DISPATCH — Milestone 1 Worker: Backend Foundation & Data Persistence

## Objective
Implement all Milestone 1 source code and test files for VelvetAura:
1. `package.json` (CommonJS dependencies: `express`, `mongoose`, `mongodb-memory-server`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `jest`, `supertest`; scripts: `start`, `dev`, `seed`, `test`, `test:e2e`).
2. `.env.example` with default port (5000), secret defaults, and timeout configs.
3. `server.js` (Server lifecycle, graceful shutdown handlers, DB connection gate).
4. `src/app.js` (Express configuration, CORS, json parser, health route, auth routes, static file serving, 404 handler, error handler).
5. `src/config/db.js` (Dual-mode MongoDB connection with 3000ms timeout fallback to `mongodb-memory-server`, auto-seed hook on memory boot, `disconnectDB`, `getDbMode`).
6. `src/models/User.js` (bcryptjs password hash pre-save hook, `comparePassword`, hidden password).
7. `src/models/Product.js` (Category enum, text search indexes, stock, rating, origin).
8. `src/models/Cart.js` (Items subdocuments, `recalculateTotals` pre-save hook with 8% tax and $50 free shipping).
9. `src/models/Order.js` (Frozen items snapshot, shipping address, mock payment transactionId, order number generator).
10. `src/middleware/authMiddleware.js` (`protect` Bearer JWT validation).
11. `src/middleware/errorMiddleware.js` (Global JSON error handler).
12. `src/controllers/authController.js` (register, login, getMe, updateProfile).
13. `src/routes/authRoutes.js` (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`).
14. `src/routes/healthRoutes.js` (`/api/health` returning server status and DB mode).
15. `tests/setup.js`, `tests/health.test.js`, and `tests/auth.test.js`.

## Scope Boundaries & Exclusive File Ownership
You exclusively own and modify the above files. All files MUST use CommonJS (`require` / `module.exports`) consistently.
Run `npm install` and run tests (`npm test`) to verify the implementation.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Explorer 1 Analysis: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_1\analysis.md`
- Explorer 2 Analysis: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_2\analysis.md`
- Explorer 3 Analysis: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_3\analysis.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_worker_m1_1\`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion Criteria
- All files cleanly implemented.
- `npm install` and `npm test` execute cleanly with all tests passing.
- Document test output and commands in `handoff.md`.
- Notify parent agent when complete.

## 2026-11-04T11:09:32Z
Received message:
You are teamwork_worker_m1_1.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_worker_m1_1\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_worker_m1_1\DISPATCH.md, g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md, and g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Also read the implementation plans from the 3 M1 explorers:
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_1\analysis.md
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_2\analysis.md
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_3\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement all Milestone 1 files using CommonJS (require / module.exports):
- package.json
- .env.example
- server.js
- src/app.js
- src/config/db.js
- src/models/User.js
- src/models/Product.js
- src/models/Cart.js
- src/models/Order.js
- src/middleware/authMiddleware.js
- src/middleware/errorMiddleware.js
- src/controllers/authController.js
- src/routes/authRoutes.js
- src/routes/healthRoutes.js
- tests/setup.js
- tests/health.test.js
- tests/auth.test.js

Run npm install and npm test. Ensure all tests pass.
Document commands and passing results in your handoff.md, and send a message to your parent when done.
