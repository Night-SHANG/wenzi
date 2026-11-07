# Task2 independent review — finite commerce

Reviewed84276df..61d9bdc on 2026-11-07 Beijing. Reviewer review_commerce_v09, read-only.

## Spec compliance: Approved

commerce.ts:127 supplies strict manifest/config/state/input and quote/status/buy/sell with only trades in owned state. commerce.ts:37/52 validates every listed shop/get and selected-shop resource references. commerce.ts:73 checks current public quote identity and ordered normal refusal reasons, leaving capacity to execution. commerce.ts:102 refreshes quote, computes exact safe post-values, pays first, verifies both money sides, transfers goods, verifies both stock sides and checks final cash before success.

## Strengths

Current resolution and quote logic are shared (commerce.ts:37/73/103). Both-side transfer checks catch plausible returns, absent writes, partial writes and cash changes during delivery (:112/117/120). BigInt detects balance/stock/counter overflow before writing (:98/105). Counter/event follow successful readbacks and nested errors propagate (:112/121). tests/commerce.test.ts:12 compares entire host snapshots; the suite also covers real inventory/capacity plus malformed public providers, independent resource domains, Unicode, replay and real Task1/3 composition.

## Findings and quality

Critical: none. Important: none. Minor: none. **Task quality: Approved.** Narrow ownership, exact arithmetic and transfer verification preserve the host transaction boundary.

## Cannot verify from diff

Full rollback/replay depends on unchanged host code. The diff includes full-snapshot failure/replay assertions and the implementation report records their passing run; this reviewer did not rerun them or inspect host internals. Root resolves this with existing reported real-host evidence plus the aggregate final suite, rather than an unsupported assumption of new host behavior.

## Checks

Named risk: missing item/container definitions might pass zero-count reference checks. Focused inventory.ts:11/12/47/48 confirms count validates the item and selected container even at zero; list also validates the container. Read brief/report/spec/rulings and complete diff once. No tests, mutations or subagents.
