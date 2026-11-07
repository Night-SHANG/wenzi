# v0.8 whole-branch final review / Task 4 independent review

Recorded: 2026-11-07, Beijing (UTC+08:00). Reviewed range: `beec605beb8915d53bf4513a52f0dc79ef0d0606..033da4df19076f461d6b3ae96eac39cefd7f69a4` (six commits). Reviewer is a fresh whole-branch review seat, also responsible for Root's Task 4 spec and quality gate.

## Method and evidence

Read repository `AGENTS.md`, the complete binding spec `docs/superpowers/specs/2026-11-07-party-design.md`, complete plan `docs/superpowers/plans/2026-11-07-party.md`, durable `docs/tasks/party-decisions.md`, all four task reports, task reviews and the scoped Task 3 fix review. Applied `requesting-code-review/code-reviewer.md` and SDD `references/final-review.md`. The pre-generated `.superpowers/sdd/2026-11-07-party/review-beec605..033da4d.diff` supplied the complete change inventory and code; it was read in passes for ownership/transactions, consumers/presentation, tests, and worlds/documentation. No diff was regenerated and no subagent was dispatched.

Inspected relevant unchanged host JSON, migration/restore and reconfiguration boundaries, original vitals/recovery behavior, and release fingerprint implementation to resolve concrete integration questions. The host already rejects unsafe object property names such as `__proto__`; ordinary own keys remain supported. The original vitals provider uses the same remaining-capacity-first healing arithmetic as the adapter. Exact migration identity checking remains followed by state schema/invariant validation in the host.

No test suite, build or compiled smoke was rerun, and no existing evidence was overwritten. Existing reports record 16/16 party tests, 10/10 policy tests, 48/48 battle/duel tests, 38/38 consumer/legacy tests, 10/10 real-world tests; final Preflight 6/6 with 383/383 tests and 14 worlds; build exit 0; compiled smoke 28/28. These are the implementers'/Root's recorded runs, not fresh runs by this reviewer. The earlier TS2322 failure is preserved and its narrow fix is visible in the reviewed range.

I independently executed two read-only checks:

- Recomputed `fingerprint('preflight')` and `fingerprint('built-smoke')` and compared them with the passed JSON reports. Both matched exactly: source `c4cbbd6fb53450cb873a4e35279904b26dc76b8430e9198408b15ab9c7453112`; runtime `d0f3d5da62f20acc82493936c32ea3619dbb1322e7295432157cf8357a67aab7`.
- Parsed both complete new world JSON additions directly from the supplied packet. After normalizing `time.continuous/{}` to `time.step/{secondsPerStep:10}` and converting the five advance amounts 20/30/10/10/20 seconds to 2/3/1/1/2 steps, deep equality passed for the entire world package, including all other configuration, bindings and 63 demo commands.

The checkout was clean and HEAD remained the reviewed `033da4d` before this report. Source, index, HEAD and branch were kept read-only; this report is the only reviewer-created file.

## Strengths

1. **Single ownership is preserved across the whole real composition.** `src/modules/party.ts:54` reads leader health and attributes from public providers; `src/modules/party.ts:83` changes companion health only in roster state and delegates leader health. `src/modules/party-vitals.ts:15` stores no health and checks delegated return against actual status/member reads. `src/modules/party-battle.ts:12` freezes ally identities rather than a second ally HP pool. New world bindings explicitly connect party to the original vitals and recovery to selected-member vitals.

2. **Battle progression and transactional visibility agree.** `src/modules/party-battle.ts:118` writes detached controller state before nested party damage, then verifies exact identity, HP/maxHp and actual readback. `src/modules/party-battle.ts:130` checks terminal health before queue renewal, skips dead units, bounds automatic processing and stops at a live ally. `src/modules/party-battle.ts:165` advances the acting cursor before processing enemies. This prevents immediate legacy retaliation, duplicate turns and the all-dead renewal loop. Real integration at `tests/party-world.test.ts:155` fails a later targeting decision after an earlier enemy hit and asserts the complete snapshot rollback, including skill payment/effect and receipts.

3. **Session ownership spans pending outcomes.** Both controller start/finish paths coordinate battle writes with acquire/release and verify the returned and actual owner (`src/modules/party-battle.ts:35`, `src/modules/party-battle.ts:179`, `src/modules/encounters.ts:56`). A non-null battle requires its own owner during final validation; victory/defeat does not release it. Party formation changes consult the same session. `tests/party-battle.test.ts:67` covers two party controllers plus duel; actual production session release rejection is exercised in `tests/party-world.test.ts:95`.

4. **Frozen facts coexist with current validation.** Roster stats/HP survive catalog edits/deletion, and ongoing battle enemy/reward terms survive deletion. Current catalogs still undergo independent list/get checks. Current queues remain saved facts; only new rounds call the replacement initiative policy. Structured side/ID comparison allows enemy and ally IDs to coincide. Terminal defeat remains terminal after recovery, while active restoration checks exact ordered roster, location, ownership and a living current actor (`src/modules/party-battle.ts:195`).

5. **Narrow consumer compatibility is explicit.** `src/modules/skills.ts:31` and `src/modules/quests.ts:37` reject ambiguous automatic routing and permit explicit protocol selection. Generic skill targets are validated before spending, applied effects precede the strike, and generic return is checked against actual state (`src/modules/skills.ts:118`). Legacy single-enemy shapes remain separate. Exact supported migrations preserve skill cooldowns and accepted quest baselines. Shared reward transfer retains inventory/progression authority and adds actual readback checks (`src/modules/adventure-rewards.ts:24`).

6. **Views remain composition and real behavior is tested.** `src/modules/party-view.ts:54` is stateless and generates actions through actual capability bindings; `src/modules/loadout-view.ts:114` creates target-specific skill hints only when the generic skill is available. Tests exercise quoted Unicode instance names by parsing and dispatching an emitted command, remove all views while continuing the loop, patch actual reward content, and restore a live encounter across clocks. Compiled smoke independently exercises CLI fork/patch/validate, active save/load, and renamed instances (`scripts/smoke-built.mjs:214`).

7. **Scope and evidence remain honest.** The change inventory contains no `src/engine`, `src/contracts.ts` or dependency changes; the package/lock changes are release version fields only. Source research distinguishes upstream reference behavior from local stable ordering, frozen queues, explicit rewards and transactional semantics. Documentation does not claim companion progression, graphics, multiplayer or balance work is complete.

## Issues

### Critical (Must Fix)

None found in the reviewed branch.

### Important (Should Fix)

None found in the reviewed branch. No implementation or integration blocker was identified by the code review.

### Minor (Nice to Have)

1. **Previously recorded dense battle tests remain harder to maintain.** File references: `tests/party-battle.test.ts:42`, `tests/party-battle.test.ts:62`, `tests/party-battle.test.ts:68` (the fixture declarations beginning at line 16 have the same pattern). These compress fixture setup, a long sequence of commands and many assertions into single lines. The consequence is poorer failure localization and greater review effort when a future turn/session change alters a scenario; no incorrect behavior or missing assertion is implied. Expand them into ordinary statements and small named setup helpers when next editing the affected tests. **Triage: retain as Minor, nonblocking for this batch; not silently closed or upgraded to a release gate.** Existing focused and real integration coverage gives no concrete reason to widen this final release into a formatting-only rewrite.

The earlier skills long-line recommendation has been addressed in the changed action path: target validation, payment, source dispatch/readback and cooldown write are separated at `src/modules/skills.ts:118` through its return. Some concise existing helpers remain, but they do not justify a new blocking finding or imply the previous improvement was omitted.

## Task 4 spec and quality verdicts

**Spec compliance: Approved for the implemented Task 4 scope.** The new generic/legacy routes, explicit source selectors, strict legacy migrations, row-level skill targets, stateless composed party view, actual-binding hints, 11-definition aggregation, 35-instance/63-command world pair, real authoring and compiled paths, release version and substantive documentation are present and consistent with the binding spec. Task 4 Steps 5/6 include this final review and subsequent packaging/publication; their unchecked state at the reviewed commit is an accurate in-progress delivery record rather than a missing gameplay implementation.

**Task quality: Approved.** The Root changes integrate the independently implemented providers without private-state access, extra health/inventory/progression databases, host branches or new dependencies. Tests use literal route outcomes and real production modules for integration, plus replacement providers at public contract boundaries for failure behavior. No Task 4 Critical or Important issue was found.

## Declined to judge

- **Final archive extraction, Git bundle restoration, published main identity and Notion synchronization:** these are explicitly subsequent delivery actions, not artifacts completed in this reviewed range. They must be judged from their actual outputs; the source approval below does not certify them as already done.
- **Windows-native execution and long-term balance/large-party performance:** no Windows execution or scale/long-play evidence was supplied for this batch, and the documentation expressly limits those claims. I assessed the current deterministic sample and modular code, not an unperformed platform or capacity qualification.
- **Automatic detection of separate sessions or health providers that an author deliberately cross-wires:** the public session contract is trusted local coordination, not an authentication/global actor registry. Explicit shared binding is the documented premise and is satisfied by the shipped worlds; inferring all possible shared actors would require a different contract and was not treated as an implementation defect.
- **Runtime behavior of the upstream Tuxemon game and a legal certification of its license:** the reviewed material is a fixed-source research record and the production implementation is independent. I checked consistency of the local scope/attribution statements with this branch, without rerunning or certifying the upstream product.
- **Companion personal progression/equipment/skills, capture, graphical UI, multiplayer and untrusted-code isolation:** these were considered against the product claims, which explicitly leave them for future work. They are not represented as delivered features and were not judged as requirements of the current batch.

No current-batch HP, session, turn, frozen-data, compatibility, malformed-provider, restore or real-world integration behavior was set aside merely because the spec did not enumerate its exact trigger.

## Whole-branch assessment

**Ready to merge? Yes.** The reviewed source/runtime bytes are consistent with the passed final gate evidence, and the code review found no Critical or Important defect. The remaining known readability Minor does not require a pre-merge fix. This conclusion is based on the inspected state ownership, transaction paths, invariants, compatibility implementation, tests and real world assembly, with passing tests used as supporting evidence rather than a substitute for review.

Root can complete review archival, exact-tree packaging verification and the already-authorized publication procedure. Preserve the historical failed gate, this deferred Minor, and the distinction between source approval and delivery actions that are still to be executed.
