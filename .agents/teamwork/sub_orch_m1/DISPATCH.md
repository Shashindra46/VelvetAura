# DISPATCH — Milestone 1: Backend Foundation & Data Persistence

## Objective
Implement Milestone 1 for VelvetAura:
1. Express application modular structure (`package.json`, `server.js`, `src/app.js`, configuration, middleware).
2. Dual-mode MongoDB connection in `src/config/db.js` (connects to `MONGODB_URI` if present and responsive within 3000ms; automatically starts `mongodb-memory-server` fallback if absent or connection fails; auto-seeds initial data on memory startup).
3. Core Mongoose models: `User.js` (with bcryptjs hashing), `Product.js` (with category enum and search indexes), `Cart.js` (with pricing recalculation logic), `Order.js` (with status tracking and mock payment reference).
4. Authentication routes and controllers (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`).
5. JWT verification middleware (`protect`) and global error handling middleware.
6. Health check route (`/api/health`) returning server status and active database mode ("memory" or "external").

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Backend Survey Findings: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_survey_1\analysis.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\sub_orch_m1\`
- Parent Conversation ID: `4bf3fe76-4743-4e62-a1da-88651478076c`

## Instructions & Protocol
- Execute the iteration loop (2B):
  a. Spawn Explorer (teamwork_explorer) to plan implementation details.
  b. Spawn Worker (teamwork_worker) with explorer plan and mandatory integrity warning. Worker implements code, runs build & tests, and reports results.
  c. Spawn 2 Reviewers (teamwork_reviewer) to verify correctness, completeness, and interface conformance.
  d. Spawn 2 Challengers (teamwork_challenger) to empirically stress-test.
  e. Spawn Forensic Auditor (teamwork_auditor) for binary veto integrity verification.
  f. Evaluate Gate. Clean pass required on all criteria.
- Maintain `SCOPE.md`, `progress.md`, and `GATE_STATUS.md` in your working directory.
- Deliver `handoff.md` and message parent when complete.
