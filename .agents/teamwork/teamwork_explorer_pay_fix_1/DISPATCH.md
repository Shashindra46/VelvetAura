# DISPATCH — Webhook Idempotency Remediation Explorer

## Timestamp
2026-11-05T09:55:00Z

## Role
teamwork_explorer

## Working Directory
g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_fix_1\

## Original Request File
g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md

## Scope Document
g:\VelvetAura\.agents\teamwork\orchestrator_4\SCOPE.md

## Gate Failure Report
g:\VelvetAura\.agents\teamwork\orchestrator_4\GATE_STATUS.md

## Challenger 1 Report
g:\VelvetAura\.agents\teamwork\teamwork_challenger_pay_1\handoff.md

## Scope & Instructions
Investigate the exact root causes and formulate the fix strategy for the two PayHere webhook failures in `tests/adversarial_payhere_stress.test.js`:
1. Replayed/duplicate status -1 / -2 webhooks cause double inventory rollback (`Expected: 50, Received: 52`).
2. Stale status -1 webhooks downgrade already-paid orders (`Expected: "paid", Received: "failed"`).
3. Formulate the precise code modifications for `src/controllers/paymentController.js` so that:
   - If `order.paymentStatus === 'paid'`, any status -1 / -2 notification is ignored (returns HTTP 200, no downgrade, no stock restore).
   - If the order was already `failed` or `cancelled`, repeated status -1 / -2 notifications return HTTP 200 and do NOT restore stock again.
   - Stock rollback occurs strictly on the initial transition to failed/cancelled.
Write your recommendations to `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_fix_1\handoff.md` and notify me via send_message.
