# DISPATCH

## Objective
Extract and mine precise technical specifications from `ORIGINAL_REQUEST.md`: data models/schemas (User, Product, Cart, Order), imported beauty product seed data attributes (skincare, cosmetics, fragrances, haircare; imported origins/brands, prices, stock), API endpoint contracts and HTTP status codes, test runner and test case requirements (automated verification suite with npm test, in-memory MongoDB runner, seed command).

## Scope Boundaries
- Read-only specification extraction.
- DO NOT write, modify, or create source code files.
- Deliver findings in `analysis.md` and a structured `handoff.md` in your working directory.

## Inputs
- Authoritative user request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_survey_3\`
- Project Workspace: `g:\VelvetAura`

## Completion Criteria
- Formal specification of schemas, fields, validation rules.
- Complete API specification (routes, methods, request bodies, response payloads).
- Test suite specifications (Tiers 1-4 coverage, npm test requirements).
- Complete `handoff.md` and notify parent.

## 2026-11-04T10:50:03Z
You are teamwork_spec_miner_survey_3.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_survey_3\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_survey_3\DISPATCH.md and thoroughly study g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Extract and formalize all technical specifications: data models (User, Product, Cart, Order), validation rules, API endpoint contracts and HTTP status codes, sample seed data taxonomy for imported beauty products (skincare, cosmetics, fragrances, haircare, origins/brands, pricing, stock), database fallback mechanics (local MongoDB or in-memory fallback), and test suite verification specifications.
Document your findings in analysis.md and write a self-contained handoff.md in your working directory.
Send a message to your parent when done.
