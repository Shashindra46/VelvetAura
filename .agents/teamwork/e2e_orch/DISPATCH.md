# DISPATCH — E2E Testing Orchestrator

## Objective
Establish the requirement-driven opaque-box E2E testing infrastructure and comprehensive test suite for VelvetAura:
1. Create `TEST_INFRA.md` at `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_INFRA.md`.
2. Design and implement the 4-tier test suite based strictly on `ORIGINAL_REQUEST.md` and `PROJECT.md`:
   - Tier 1: Feature Coverage (>=5 test cases per inventoried feature)
   - Tier 2: Boundary & Corner Cases (>=5 test cases per feature where boundaries exist)
   - Tier 3: Cross-Feature Combinations (pairwise interaction testing)
   - Tier 4: Real-World Application Scenarios (realistic end-to-end shopping & checkout workflows)
3. Ensure the test runner exercises the system as an opaque box (HTTP requests against running server endpoints), independent of internal implementation code.
4. Publish `TEST_READY.md` at `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_READY.md` with execution commands and coverage summary table.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\e2e_orch\`
- Parent Conversation ID: `4bf3fe76-4743-4e62-a1da-88651478076c`

## Instructions & Protocol
- Follow the E2E Testing Track specifications in the Project Pattern.
- Delegate test writing to `teamwork_test_writer` or `teamwork_worker`.
- Verify with `teamwork_reviewer` and `teamwork_auditor`.
- When all test cases and runner are verified and ready, create `TEST_READY.md` and notify parent.
