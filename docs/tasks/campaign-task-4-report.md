# v0.6 root integration report

## Implementation

Root owns the generic command transport, composed campaign view, catalog export, two world configurations, actual compiled CLI smoke, package version, docs and integration tests. Ten new definitions join the22 existing ones; ten world configurations are discovered. Each campaign composition uses20 instances. No change to src/engine, src/contracts.ts or dependency versions.

The46-action chain uses actual inventory/location/gathering/recipe/crafting/market/time modules and actual progression/vitals/encounter/quest providers. Expected final state is totalXP105,level3,HP22/34,coins16,time60s,wins wolf2/raider1, each of three quests completed once, empty activequests,battle and craftingjob. Repeat patrol establishes a fresh baseline and reaches XP145/wolf4/patrol2 after another two claims.

JSON command transport delegates to the existing public parseCommand; both new and frontier text views format dynamically bound instance IDs. CLI keeps legacy syntax and recognizes early--json failures while respecting--. Frontier site location values validate before filtering. Its old empty state migrates explicitly from1.0.0 to1.0.1. Campaign view composes a bound text-view capability without importing frontier implementation or writing gameplay state.

## Development evidence

1. CLI JSON-instance command, early structured error and malformed frontier site tests produced3 executed assertion failures. After implementation, `node --test tests/command-text.test.ts tests/cli.test.ts tests/frontier.test.ts` passed16/16. A later18-test execution handle vanished after launch; no result is claimed for that interrupted run. Final integrated Preflight covers the current source and additional migration/hint tests.
2. Before adding worlds, `node --test tests/campaign.test.ts` produced7 assertion failures that campaign was not discoverable. After world/view composition the same file passed7/7 (9076ms); captured in artifacts/campaign-integration-focused.log. Actual-provider tests cover both clocks, activebattle/quests save→restore→clock replacement, fullbag pendingvictory retry, frozenquest rewards, removal of both views, repeatquest baselines and crafting a remedy after defeat.
3. A malformed foreign quest readiness regression was added for the final integrated run. It rejects a string readiness field and preserves the complete snapshot.
4. `node --test --test-name-pattern='view follows Unicode' tests/campaign.test.ts tests/frontier.test.ts` exposed2 failures, then passed2/2 (5191ms) after matching codepoint length semantics. Legal65/128astral IDs work;129rejects with unchangedstate. Exact logs are artifacts/campaign-view-unicode-red.log and-green.log.
5. `node --test --test-name-pattern='battle phases inconsistent' tests/campaign.test.ts` exposed a missing-exception assertion, then passed1/1 (4338ms) after validating displayed phase/health consistency. Exact logs are artifacts/campaign-view-phase-red.log and-green.log.
6. `node --test tests/release-evidence.test.ts` passed3/3 (2.66s). This tests evidence gating with deliberately labeled synthetic fixture evidence in a temporary repository; no fake gameplay implementation is used as release evidence. Separate failure tests execute actual failing verification scripts and assert stale success replacement. Real compiled application smoke remains required.

## Review corrections and compatibility

The three independent module reviews caught schema/manual Unicode inconsistencies. Their original implementers fixed and tested their own files; scoped rereviews accepted all three fixes. The controller also identified matching published gathering/crafting defects and assigned one bounded extra implementer, preserving state schema/capability versions while bumping implementation versions and adding explicit migrations. Its14 focused regressions include genuine paidjob/cooldown state and independently observed MIGRATION_REQUIRED before migration code. Root's two view checks were fixed in Task4 before its independent whole-branch gate. See the corresponding implementation and review reports.

## Initial integrated gates (before the final parser correction)

Single integrated `npm run preflight` passed6/6 at2026-11-07 01:29Beijing;251tests passed,0failed, strict typecheck and all10world demonstrations/restores passed. `npm run build` passed. Exact logs: artifacts/campaign-preflight.log, campaign-build.log. Source fingerprint: bd949584deee8a6d7f1c7277779d1d22669beb425ee6c1efa380a6e6a553355e. Real compiled smoke passed18/18groups at2026-11-07 01:29Beijing, exit0. Exact log artifacts/campaign-built-smoke.log and report built-smoke.json; fingerprintd035e569146b50d84cfcbe89e8e30d1dfc48c4a7df462ee74e073f06fbee7289. Includes actual fork/patch/validate campaign withXP110, interactive46actions+save/load, and allinstanceIDs containingwhitespace/quotes. Fresh independent whole-branch review remains pending; old v0.5 reports are not evidence for v0.6.

## Boundaries

Finite original example content, explicit simulated time, one local character and one duel at a time. No browser UI, new network authority, hidden second inventory or untrusted-code sandbox. Sources for growth/quest semantics were pinned and read; upstream code/data were not copied or translated. No new dependency.

## Final source acceptance after the bounded correction

The only final-review sourcefinding was legalbrace-prefixedlegacytargethandling. Fix1fc60e2 restores syntax-failingJSON tolegacygrammar without allowing structurallyinvalid successfullyparsedJSON to fallback. The implementer observed2behaviorfailures/1pass then12/12coveringtests; independentfixdiffreview isPASS, noopenfindings. READMEheadlinewascorrectedindocumentation.

Required current-input gates were refreshed exactly once after thatsource/testchange:

- `npm run preflight > artifacts/campaign-preflight-final.log 2>&1`: exit0;254tests,254passed,0failed/skip;6/6checks including stricttypecheck andall10worlddemos/restores. 2026-11-07 01:41Beijing. Fingerprint`e8ff94ac8338187f7415592f68e30d4074aa44d87ac547a2adb5abd1cf3f430f`.
- `npm run build > artifacts/campaign-build-final.log 2>&1`: exit0.
- `node scripts/smoke-built.mjs > artifacts/campaign-built-smoke-final.log 2>&1`: exit0;18/18actualcompiledgroups. 2026-11-07 01:41Beijing. Fingerprint`dc24a21ce7de040b3b25f0c685a30b67dde325e481338fa166d54281d680194b`.

The earlier251-test/initial18-groupevidenceaboveishistorical, notsubstitutedforthefinalcorrectedbytes. Documentation-onlyarchivaldoesnotchangetheverificationinputs. Archiveconstructionandindependentunpack,GitHubmainpublicationandNotiondeliveryrecordremainthenextactualstepsafterthisdocumentcommit; noneareclaimedcompletehere.
