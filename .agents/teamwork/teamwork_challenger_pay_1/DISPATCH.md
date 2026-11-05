# DISPATCH — PayHere Hash & Webhook Stress Challenger

## Timestamp
2026-11-05T09:37:00Z

## Role
teamwork_challenger

## Working Directory
g:\VelvetAura\.agents\teamwork\teamwork_challenger_pay_1\

## Original Request File
g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md

## Scope Document
g:\VelvetAura\.agents\teamwork\orchestrator_4\SCOPE.md

## Worker Handoff
g:\VelvetAura\.agents\teamwork\teamwork_worker_pay_1\handoff.md

## Scope & Instructions
Adversarially challenge and stress-test the PayHere service and webhook callback implementation:
1. PayHere Hash Generation & Signatures:
   - Test edge amounts: 0, 0.01, 1000, 12500.5, integer amounts requiring `.00`, very large amounts.
   - Verify uppercase formatting (no lowercase hex characters).
   - Verify tamper sensitivity: flip single bits or chars in merchantId, orderId, amount, currency, secret, status code.
2. Webhook Callback IPN (`POST /api/payments/payhere/notify`):
   - Adversarially submit spoofed signatures -> must reject with HTTP 400.
   - Test non-existent order numbers -> must handle gracefully without crashing.
   - Test status code 2 (paid) -> verify order transitions to `paymentStatus: 'paid'`.
   - Test status codes -1 and -2 -> verify order transitions to `paymentStatus: 'failed'` and verify stock rollback compensation.
   - Test duplicate/replay webhook requests (idempotency) -> verify no double inventory rollback or corrupted state.
3. Deliver your empirical findings and verdict (`APPROVE` or `REQUEST_CHANGES`) in `g:\VelvetAura\.agents\teamwork\teamwork_challenger_pay_1\handoff.md` and notify me via send_message.
