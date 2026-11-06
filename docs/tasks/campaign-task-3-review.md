# Task 3 independent spec and quality review

Reviewed the Task 3 brief and implementation report, the public preamble and complete quest section of `docs/superpowers/specs/2026-11-07-campaign-design.md`, the supplied owned-file diff `review-task-3-3c8ba01..f4ddc06.diff`, and the actual contents of `src/modules/quest-rules.ts`, `src/modules/quests.ts`, and `tests/quests.test.ts`. Existing capacity/inventory and host JSON/schema/transaction code were read only to establish boundary behavior. Parallel owners' edits are outside this review.

## Verdicts

- **Spec compliance: FAIL pending one P2 correction.** The manual ID reader rejects legal IDs accepted by the existing `idSchema`, contrary to the explicit public requirement. Core quest lifecycle behavior otherwise matches the reviewed requirements.
- **Quality: CHANGES REQUESTED for the same P2 issue.** No separate transactional, frozen-definition, counter-baseline, or duplicate-grant defect was identified. The existing 17-test suite was read, not rerun; its reported result is owner evidence, not an independent verification result here.

## Finding

### P2 — Count ID code points consistently with `idSchema`

**Primary reference:** `src/modules/quest-rules.ts:19`, `questId`.

**Affected callers:** `readQuest` and `readQuestCounts` in `quest-rules.ts:20–36`; current catalog assembly through `quest-rules.ts:53–61`; inventory IDs in `quests.ts:27–35`; encounter record IDs in `quests.ts:37–42`; location identity in `quests.ts:55–59`.

The existing ID schema (`src/modules/capacity.ts:7`) permits 1–128 Unicode code points. AJV enforces that schema using code-point length. `questId`, however, uses JavaScript `value.length`, which counts UTF-16 code units. An ID of 65 `😀` characters has 65 code points and 130 code units: the schema accepts it but this reader rejects it. This is a concrete local-provider interoperability defect, not a hypothetical malformed-provider case. It prevents a valid `quests.catalog` from assembling. In the journal it can also reject an otherwise valid inventory solely because the bag contains an unrelated legal item ID.

**Narrow independent repro:** Ran one in-memory `node --input-type=module` probe using actual `ModuleRegistry`/`createWorld`, the actual schema and catalog/journal/inventory modules, and a minimal ordinary progression fixture. No source/test file was created or modified for the probe. The command exited 0 after asserting all these observations:

1. `const id = '😀'.repeat(65)`; `[...id].length === 65`, `id.length === 130`, and `new Ajv().compile(idSchema)(id) === true`.
2. A world with only `quests.catalog` and a quest keyed by that ID (ordinary delivery `{tool:1}`, empty victories/rewards, experience 0) throws `INVALID_QUEST: 任务提供者返回了无效定义`.
3. A normal quest catalog plus actual inventory containing `tool:1` and `[id]:1` assembles successfully without the journal.
4. Adding `quests.journal` to that same world throws `INVALID_INVENTORY: 库存物品列表无效或重复`.

**Expected:** These legal IDs assemble and remain addressable through the usual lifecycle. IDs exceeding 128 code points still reject. The host's reserved-key policy remains unchanged.

**Correction direction:** Make the manual ID length check agree with `idSchema` (code points), and add a focused regression using a supplementary-plane ID. Cover the local catalog path and at least the journal inventory boundary because that second path fails even when the quest itself uses ordinary ASCII IDs. This is one shared helper defect; the affected callers are not separate findings.

## Reviewed behavior and declined judgments

- **Frozen/current separation — no finding.** `currentCatalog` validates the installed catalog and prerequisite graph independently; `validate` checks references for current definitions and frozen active definitions separately. Accepted `definition` takes precedence in list/turn-in. Frozen encounter targets read records without requiring a surviving encounter description; frozen item/location references remain mandatory. Completed IDs survive catalog deletion and retain fallback display/count.
- **Counter semantics — no finding.** Acceptance stores current wins for each target. Remaining victories subtract the baseline, and repeat acceptance captures a fresh baseline. The baseline keys are checked against the frozen targets. Counter rewind rejects during validation and before abandonment deletes the evidence. Safe arithmetic does not introduce another count overflow beyond the explicit safe-count gates.
- **Readiness/display — no finding under root clarification.** `ready` requires an accepted quest, satisfied objectives, and an allowed current location. Inactive rows subtract current delivery inventory while displaying the full future victory requirement. Lack of an allowed location does not change the status vocabulary to `locked`; the spec only requires allowed location on acceptance/turn-in and readiness.
- **Atomic delivery/rewards — no finding.** Inventory removal and each reward join the host transaction; each mutation's returned and subsequently queried quantity must equal the expected count. XP gain receives the same checks, and completion increment/active removal occur in the same transaction. A later failure rolls the host snapshot back. Repeated turn-in fails because active state was removed. No extra local inventory or XP account is stored.
- **Optional providers — no finding.** Delivery-only unconstrained quests avoid location/encounter access. Constrained current/frozen quests require the corresponding optional binding. The current catalog still rejects unresolved references even when an accepted definition is valid.
- **Foreign contracts — no additional finding.** Consumed catalog fields, get/list identity and terms, counts, inventory result quantities, encounter record counts, and referenced/current location identities are validated. Inventory `count`/mutation results expose quantity rather than an item identity in the existing provider contract, so absence of an invented identity check is not a defect. Unconsumed progression metadata and encounter combat fields need not be validated by the journal.
- **Own legal object keys — no additional finding.** Object maps use own-key reads and explicit own-property writes; `Object.fromEntries` handles legal prototype-like data keys. Host JSON copying rejects the three existing reserved keys before these consumers see them. The Unicode finding above is the remaining legal-ID issue.
- **Test readability — nonblocking judgment.** Many test bodies are compressed onto long lines, which makes later review harder, but this alone does not justify blocking the task or broadening scope. The specific missing Unicode boundary regression belongs with the P2 correction.

## Verification limits and scope

No unchanged 17-test rerun, global test/typecheck/build, dependency changes, core/contracts edits, commits, index operations, or sub-agent actions were performed. Only the concrete Unicode risk received a narrow real-host probe. This report is the only file written by this review lane.
