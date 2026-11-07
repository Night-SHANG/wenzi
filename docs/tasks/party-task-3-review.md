# Task 3 scoped review — 2d5ae95..3bebf97

## Spec Compliance

- ✅ Spec compliant for the Task 3 implementation visible in the supplied diff. All five requested implementation/test files have corresponding changes. The battle owns enemy HP, queue and reward lifecycle while reading allied HP through the public party interface (`src/modules/party-battle.ts:12`, `src/modules/party-battle.ts:81`, `src/modules/party-battle.ts:118`).
- ✅ Frozen participants, separate side/ID identity, exact queue permutations, live actor/target validation, bounded automatic turns and round renewal implement the stated turn semantics (`src/modules/party-battle.ts:94`, `src/modules/party-battle.ts:130`, `src/modules/party-battle.ts:165`, `src/modules/party-battle.ts:219`).
- ✅ Session acquisition/release checks both command return and actual ownership; terminal states retain ownership until completion. Legacy duel migration accepts only its own 1.0.0/1.1.0 stateVersion 1 history (`src/modules/party-battle.ts:35`, `src/modules/party-battle.ts:179`, `src/modules/party-battle.ts:195`, `src/modules/encounters.ts:56`, `src/modules/encounters.ts:73`).
- ✅ Shared reward transfer preserves original inventory/progression authorities and validates actual post-command quantities, with pending-state retry coverage (`src/modules/adventure-rewards.ts:24`, `src/modules/encounters.ts:101`, `tests/party-battle.test.ts:55`, `tests/encounters.test.ts:183`).
- ✅ Leader-only combat-action and optional sole target use the same strike path; movement veto filters the bound provider (`src/modules/party-battle.ts:234`, `src/modules/party-battle.ts:255`). Active restore validation checks location, exact roster, live current ally, session, queue, HP and time (`src/modules/party-battle.ts:195`).
- ✅ The diff contains no engine/contracts edits or dependency changes. Queries do not write state; counters use safe arithmetic and cooldown completion rejects overflow/precision loss (`src/modules/party-battle.ts:130`, `src/modules/party-battle.ts:179`, `src/modules/party-battle.ts:256`).
- ⚠️ Whole-branch legacy-world preservation, real Task 1/2 composition, aggregate build and release checks are controller integration responsibilities, not independently established by this scoped diff. The controller reports its real-provider integration 7/7 passing; this review does not relabel that report as an independently rerun result.

## Strengths

- Cross-capability HP writes are preceded by the controller's detached-state write, and HP verification compares identity, expected result and actual party reads (`src/modules/party-battle.ts:118`). This addresses the nested-query ordering requirement directly.
- Current catalogs remain separately validated while the battle retains frozen enemies/rewards, and describe/start require membership in the current list (`src/modules/party-battle.ts:61`, `src/modules/party-battle.ts:219`, `tests/party-battle.test.ts:61`, `tests/party-battle.test.ts:106`).
- Tests exercise meaningful full-host behavior and full-snapshot rollback: malformed downstream results, failed release, inventory capacity/XP overflow, policy replacement, revival timing, cross-side equal IDs, astral IDs and restore corruption (`tests/party-battle.test.ts:51`, `tests/party-battle.test.ts:58`, `tests/party-battle.test.ts:64`, `tests/party-battle.test.ts:71`, `tests/party-battle.test.ts:83`, `tests/party-battle.test.ts:87`).

## Issues

### Critical (Must Fix)

- None found.

### Important (Should Fix)

- None found.

### Minor (Nice to Have)

- `tests/party-battle.test.ts:42`, `tests/party-battle.test.ts:62`, `tests/party-battle.test.ts:68`: long single-line test scenarios combine setup, several actions and many assertions. Their coverage is valuable, but the compression makes a failing scenario harder to inspect and future behavioral edits harder to review. Expand the new fixtures and scenarios into conventional statements/blocks when touching them next; no behavior change or additional suite is required for this review.

## Checks and Scope

- Reviewed the supplied diff once; the initial tool output omitted the middle, so retrieved only the missing battle-controller/legacy-test portion. Later extracted line references from that same diff; did not reread changed source files or run git commands.
- Named outside-diff risk: JSON comparison of catalog enemies could falsely reject equivalent objects with different key insertion order. Checked `readSquad` in `src/modules/squad-rules.ts:36`; it rebuilds enemy objects in canonical field order, so the comparison is safe.
- Named outside-diff risk: imported party readers could omit identity/flag/numeric checks, making `member()` consistency checks insufficient or incorrectly rejecting leader attack zero. Checked `readPartyMember`/`readPartyStatus` in `src/modules/party.ts:14`; they validate these invariants, normalize consumed fields, permit leader attack zero and require positive companion attack.
- No tests rerun: the implementer reports final focused 48 pass / 0 fail / 0 skipped with exit 0, and static inspection raised no specific unresolved behavioral doubt requiring another run (`.superpowers/sdd/2026-11-07-party/task-3-report.md`, actual RED/GREEN section).

## Assessment

**Task quality: Approved.**

**Reasoning:** The implementation follows the specified ownership and transaction boundaries, validates external results at consumption points, and supplies substantive rollback/restore/turn-order coverage. The remaining readability note is nonblocking; aggregate integration and release evidence remain the controller's gate.
