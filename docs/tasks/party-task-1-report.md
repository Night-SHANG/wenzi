# Task 1 — persistent party, session ownership and selected-member vitals

Recorded 2026-11-07 12:41 Beijing (UTC+08:00). Branch `feat/party-battles`; task baseline `8444ddcea75e7e85947593676e1d65d187236577`.

## Result

Implemented the four requested public definitions without changes to engine/contracts, registry, worlds, shared docs, dependencies or other owners' files. No staging or commits were performed. No subagents were spawned. Task 1 focused verification is green; aggregate tests, typecheck, build and release gates remain root-owned.

### Files and public interfaces

- `src/modules/battle-session.ts`: `sessionModule` (`battle-session.exclusive`, definition/state 1.0.0/1). Empty config; `{owner:null|string}` state; exact-owner `acquire`/`release`, including rejecting repeated acquisition by the same owner and release while idle.
- `src/modules/companion-rules.ts`: `companionRulesModule`, `CompanionDefinition`, `readCompanion`; stateless `companions.catalog` exposes `companion-rule@1.0.0`. Schema and public reader validate IDs, nonempty names and safe stat ranges. `companionSchema` is additionally exported as a reusable exact schema.
- `src/modules/party.ts`: `partyModule`, `PartyMember`, `readPartyMember`, `readPartyStatus`; additionally exports the `PartyStatus` type. `party.roster` owns only recruited companion terms/HP and the companion active list. Public `active` prepends the leader; public members are leader, current catalog order, then deleted-but-recruited entries without duplicates.
- `src/modules/party-vitals.ts`: `partyVitalsModule` (`vitals.party-member`), provides both `vitals` and `vitals-selection`. State is exactly `{member}`; it never owns HP. Public selected member/list agreement is checked before selecting, querying and delegating damage/healing.
- `tests/party.test.ts`: 16 public-host behavior tests using real progression, attributes, vitals, capacity, inventory and recovery where available, plus ordinary public capability replacements for malformed-response and late-failure cases.

### Behavior and ownership

The leader's HP/maxHp always come from bound original `vitals`; attack/defense come from optional bound attributes, otherwise progression. Leader attack zero is allowed (derived attributes can reduce it to zero); companion catalog/frozen attack remains positive. The party never copies leader HP or progression state.

Recruitment freezes all companion terms and starts in reserve at full HP exactly once. Reserve/active changes preserve damage, and no dismissal/re-recruitment healing path exists. Catalog edits or deletion preserve recruited facts, while the current catalog still validates independently. Every catalog list entry is read and checked against its `get` result, including identity, all consumed terms and unique IDs. Saved member record keys must equal the stored member IDs; saved active members must be unique, recruited companions within capacity.

A non-null battle session blocks recruit/setActive and remains effective for any controller phase until its accurate release. Ordinary party damage/heal and selected member recovery remain available during ownership. Session ownership is a local coordination protocol, as specified; controller lifecycle/terminal release rules remain the battle owner's responsibility.

Leader damage/heal verifies the expected clamped HP against both delegate return and actual vitals query, then verifies the party readback. The adapter verifies party return identity/ranges, expected HP/maxHp, actual query and status/member agreement. All writes, nested calls, events and real item removals use the existing shared host transaction. Failures leave complete snapshots unchanged.

Public readers validate member identity/name/stats/HP/flags, leader uniqueness and position, active uniqueness/order prefix/capacity, membership and all active/recruited/leader flag relationships. `readPartyStatus(ctx)` uses the bound public party capability, never a self call from party's own implementation.

## Verification evidence

Command scope throughout: `node --test tests/party.test.ts`. Commands were wrapped only to preserve their stdout/stderr logs and original exit status.

| Run | Actual result | Node duration | Evidence |
| --- | --- | --- | --- |
| Initial RED, after manifest-only API scaffolding | 12 tests, 0 pass, 12 fail, exit 1 | 8,804.737988 ms | `.superpowers/sdd/2026-11-07-party/task-1-red.log` |
| First implementation run | 12 tests, 11 pass, 1 fail, exit 1 | 18,606.0352 ms | Observed tool output; failure was test replacement fixture accidentally advertising progression as well as attributes, causing `leader-hp` provider ambiguity |
| Core GREEN, after correcting that fixture to provide only attributes | 12 tests, 12 pass, 0 fail, exit 0 | 22,932.013039 ms | `.superpowers/sdd/2026-11-07-party/task-1-green-core.log` |
| Final expanded GREEN | 16 tests, 16 pass, 0 fail, exit 0 | 24,450.080569 ms | `.superpowers/sdd/2026-11-07-party/task-1-green.log` |

The initial RED exercised the behavior tests against explicit `NOT_IMPLEMENTED` API scaffolds. Because real recovery validation immediately queries the selected vitals capability, missing selected-vitals behavior failed assembly before later actions could run; this is recorded as missing-feature RED and is not represented as sixteen independently isolated pre-fix regressions. Four supplemental boundary tests were added after core GREEN for self-review coverage.

### Final tested cases

1. Recruit → reserve → activate → damage → reserve → reactivate retains HP; repeated recruitment fails; leader HP is the original vitals fact.
2. Frozen name/maxHp/attack/HP survive current catalog editing, deletion and save/restore; deleted recruited companions can still activate.
3. Capacity zero/one, duplicate/unknown/unowned/leader active IDs, unknown recruitment, nonrecruited HP edits and leader collisions reject atomically.
4. Exact session owner acquisition/release, same-owner re-acquisition failure, roster blocking and HP recovery while held.
5. Real recovery/inventory restore either leader or reserve companion, consume exactly one item, preserve other members, reject full HP atomically, and save/restore selection only.
6. Zero HP persists; huge positive damage/heal clamps safely; zero/negative/fractional/unsafe amounts reject.
7. Malformed current catalog list/get, duplicate IDs, invalid terms and get/list identity/stat disagreements fail, even with frozen members.
8. Malformed leader vitals/attribute response fields reject; zero derived leader attack remains valid.
9. Late delegate failure, emitted events, malformed return and false-success unchanged actual HP roll back complete snapshots and item payments.
10. Own `toString`/`hasOwnProperty`, spaces/quotes/Chinese and astral IDs of 65/128 code points survive commands and restore; 129 rejects.
11. Pure queries, member/status equality and public-reader leader/active/flags/duplicate validation.
12. Unknown config/command fields and corrupt saved roster keys/IDs/HP/active relationships reject.
13. Dishonest external party return identity/HP/maxHp and actual readbacks reject atomically through the adapter and real recovery.
14. Malformed session owner and unowned initial/restored selected member fail closed.
15. Real progression/attributes remain live for leader HP limits and attack/defense while companions stay frozen.
16. Companion healing near `MAX_SAFE_INTEGER` clamps remaining capacity before addition.

## Self-review and remaining integration checks

Reviewed exact spec interfaces and ownership, safe arithmetic, Unicode/own-key handling, detached state writes, strict config/state/command schemas, catalog freeze vs current validation, query purity, nested rollback and no new dependencies. No known functional concern found in this task's scope.

Root must still perform aggregate TypeScript/build/Preflight gates, actual world bindings (original leader vitals vs selected-member adapter), battle pending-phase lifecycle integration and independent spec/quality review. The task intentionally ran no aggregate suite, typecheck or build because the plan centralizes those gates with root. Explicit shared-session and vitals bindings remain the world author's responsibility, as designed.
