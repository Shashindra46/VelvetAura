# DISPATCH — E2E Test Writer: Test Infrastructure & Opaque-Box Suite

## Objective
Design and implement the E2E Testing Track for VelvetAura:
1. Create `TEST_INFRA.md` in `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_INFRA.md` covering methodology, feature mapping, runner architecture, and tier coverage thresholds.
2. Author an opaque-box automated test suite that exercises the full application endpoints via HTTP:
   - Tier 1: Feature Coverage (>=5 test cases per feature across Auth, Catalog, Cart, Orders, Health)
   - Tier 2: Boundary & Corner Cases (invalid logins, zero/negative quantities, empty carts, non-existent product IDs, out-of-stock items)
   - Tier 3: Cross-Feature Interactions (register -> login -> browse -> add to cart -> checkout -> verify order in history)
   - Tier 4: Real-World Scenarios (complete luxury beauty shopping workflows)
3. Ensure tests run independently using in-memory MongoDB.
4. When test cases and runner are authored, create `TEST_READY.md` in `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_READY.md` summarizing coverage and command to run.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_test_writer_e2e\`

## Completion Criteria
- Publish `TEST_INFRA.md` and `TEST_READY.md`.
- Author test files under `tests/e2e/`.
- Produce `handoff.md` and notify parent.


## 2026-11-04T11:00:25Z
You are teamwork_test_writer_e2e.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_test_writer_e2e\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_test_writer_e2e\DISPATCH.md, g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md, and g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Design the E2E testing infrastructure (publish TEST_INFRA.md at g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_INFRA.md) and implement comprehensive opaque-box test suites (Tiers 1-4: Feature coverage, Boundary/corner, Pairwise interactions, Real-world luxury beauty shopping workloads) under tests/e2e/.
Once complete and verified, publish TEST_READY.md at g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_READY.md.
Write a self-contained handoff.md in your working directory and notify your parent.
