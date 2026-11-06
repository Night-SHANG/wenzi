# Task 1 independent spec and quality review

Reviewed supplied patch `3c8ba01..4901eb7`, the actual four production files and `tests/progression.test.ts`, Task 1 brief/report, and the public preamble plus “成长、生命与恢复（四个定义）” of `docs/superpowers/specs/2026-11-07-campaign-design.md`. Existing host/shared helper source was read only to establish the capability and JSON/schema boundaries. No unrelated working-tree changes were reviewed or edited.

## Verdicts

- **Spec compliance: FAIL pending one Important/P2 correction.** Both manual ID-length checks reject some IDs expressly legal under the shared `idSchema`.
- **Code quality: CHANGES REQUESTED for that same bounded defect.** No additional actionable correctness/atomicity issue was found within this review scope. This is not a finding against the host or a request to change its reserved-key policy.

## Important / P2 — legal Unicode IDs disagree between schema and capability consumers

**Exact sites:** `src/modules/progression.ts:15`; `src/modules/recovery.ts:8` and its use at `src/modules/recovery.ts:38`. Relevant existing contract: `src/modules/capacity.ts:7` (`idSchema`, `maxLength: 128`), used for progression stat property names and configured location IDs. Coverage gap: `tests/progression.test.ts:104–109` tests legal special keys but omits astral-character length boundaries.

JSON Schema/Ajv string length counts Unicode code points. JavaScript `string.length` counts UTF-16 code units. Consequently `const key = '😀'.repeat(65)` is a valid 65-character ID under the shared schema but has JavaScript length 130. The new modules reject it at their manual boundaries:

1. A world containing only `progression.curve`, with `levels: [{experience: 0, values: Object.fromEntries([[key, 1]])}]`, assembles and resolves successfully. Adding `progression.track` with `initialExperience: 0` makes the same valid curve fail assembly with `INVALID_PROGRESSION_RULE`.
2. A real `location.nodes` world with `start: key`, a node whose own key is `key`, and a recovery remedy restricted to `[key]` assembles successfully. Give the real inventory one tonic and initialize real vitals to `10/20`. `recovery.use({remedy: 'tonic'})` fails with `INVALID_LOCATION` even though `location.current.id` is exactly the configured allowed ID. The failed operation correctly preserves the complete snapshot; the defect prevents valid recovery rather than corrupting state.

**Fresh verification:** One focused `node --input-type=module` stdin probe imported the real registry/engine and the four new modules, plus existing inventory/capacity/location modules. It performed the two constructions above and a recovery dispatch. Exit 0; actual output:

```text
legal-stat-schema-accepted true
legal-stat-tracker-rejected INVALID_PROGRESSION_RULE 成长属性必须为有效ID与非负安全整数映射
legal-location-assembled true
legal-location-use-result {"ok":false,"revision":0,"error":{"code":"INVALID_LOCATION","message":"地点提供者没有返回有效当前位置"}}
failure-atomic true
```

**Requested correction:** Make both manual validations consistent with the existing schema's Unicode code-point length while retaining type checks, nonempty IDs, the 128-character bound, and existing host-reserved object-key behavior. Add focused regressions showing that a stat key and restricted current-location ID containing 65–128 astral characters work, and an externally returned ID/stat key containing 129 code points is rejected. Do not tighten the public schema or change core/contracts to accommodate these manual checks.

## Other inspected requirements

- All four named exports and definition/capability identities match the spec. Manifest/API/state/capability versions are `1.0.0 / 1 / 1 / 1.0.0`; the supplied diff adds no dependency or core/contract changes.
- Curve configuration validates 1–1000 thresholds, zero first threshold, strict increase, and safe-count value maps. Tracker state contains cumulative XP only; gain validates overflow before writing and re-resolves after compatible curve changes. Consumed external resolver fields are checked for identity, safe numeric values, feasible levels/floors, next threshold bounds, and value maps.
- Vitals stores only its own HP, independently checks consumed positive safe `maxHp`, clamps arithmetic before potentially unsafe addition, permits healing from zero, fails at full HP, and uses no automatic healing event. Lifecycle validation rejects existing HP above a replacement maximum.
- Recovery uses own-key remedy lookup; validates all current item and nonempty location references, including unselected remedies; handles absence of optional location only when restrictions are empty; checks consumed health/location/inventory fields; and composes inventory removal plus healing in the same host transaction. It checks exact expected clamped healing after the nested call. Reported late-failure tests make an actual external healer state write after inventory removal and compare the complete snapshot.
- The actual tests cover cumulative/multilevel XP, top-level null, invalid configuration/overflow, external provider rebinding, save/restore, arbitrary stats without maxHp, no auto-heal, optional location absence/failure, legal own special keys, malformed external results, and full-snapshot rollback. The report correctly distinguishes assertion RED from its other scaffold/fixture failures; the embedded final focused output reports 20/20 passing.

## Verification limits and declined judgments

Per assignment, the reported unchanged 20-test suite was **not rerun**. Its GREEN/RED evidence is attributed to the implementer's report rather than claimed as an independent fresh suite result. The focused probe was justified by the uncovered schema/UTF-16 mismatch and was the only fresh runtime verification in this review. Root's reported integration 7/7 is context, not independently verified evidence here; full Preflight remains root-owned and was not run.

No claim is made about unrelated modules, CLI/view/world integration, packaging, publication, or complete branch readiness. Ignored inventory command return fields are not treated as consumed data, and this review does not demand that trusted capability consumers prove a provider's internal implementation beyond the specified public contract. Reserved `__proto__`, `prototype`, and `constructor` object keys remain explicitly outside the legal-own-key promise.

Only this review file was written. No production/test edits, staging, commits, or additional agents were used.
