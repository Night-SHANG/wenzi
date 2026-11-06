# F1 release evidence correction

## Scope and result

Addressed the single release-tooling finding F1 from `docs/tasks/final-review.md`. Both verification entry points now overwrite earlier evidence with `ok: false, status: "running"` before starting work. Caught failures persist `ok: false, status: "failed"` and an error before being rethrown; unsuccessful preflight checks also produce failed evidence. Successful reports carry a versioned SHA-256 fingerprint of their tested inputs. Each verifier compares the input fingerprint before and after its checks, rejecting changes made during verification.

The shared `scripts/release-fingerprint.mjs` hashes a sorted list of file paths and SHA-256 content hashes. Common inputs include package metadata and lockfile, TypeScript configuration, launch commands, world data, author examples/plugins, verification/package scripts, and installed production dependency files selected from the lockfile. Preflight additionally includes source, tests and CI configuration; built smoke additionally includes compiled `dist` files. Artifacts, documentation, Git metadata and modification timestamps are excluded. Required files/directories cannot silently disappear, and symlinks within the fingerprinted inputs are rejected. Packaging independently recomputes each scope and refuses missing, failed, legacy or mismatching evidence before creating its Git bundle or archive. It still performs no build, dependency installation or network operation.

## Red and green evidence

- Before implementation, `node --test tests/release-evidence.test.ts` exited nonzero: **0 passed, 2 failed**. The actual smoke invocation left the prior report's `ok: true` intact. The second test could not yet find the planned fingerprint helper; that initial failure alone was not treated as proof of stale-consumer behavior.
- After implementation, the stale-consumer regression was also run against the original `HEAD:scripts/package.py` in an isolated temporary copy containing the current helper/smoke. **0 passed, 1 failed**, exit 1, with the concrete assertion **`accepted changed dist/cli/index.js`**. The old consumer produced a successful archive despite the changed runtime bytes.
- Final focused run: `node --test tests/release-evidence.test.ts` exited 0: **3 passed, 0 failed**. It covers earlier-success replacement by actual failing smoke and preflight invocations; a successful offline fixture package; refusal after changes to compiled CLI, source, world data, external module, verifier script and TypeScript configuration; missing required compiled CLI; and a child CLI that throws during the actual smoke, replacing its earlier green report and blocking packaging even after the CLI is restored.
- Final strict check: `npm run typecheck` exited 0. npm emitted only its existing environment-config warning about `http-proxy`.

All regression fixtures, archives, Git repositories, missing-file probes and deliberate failures were outside the checkout. No real build outputs or verification artifacts were corrupted. Changes are limited to the three requested release scripts, the shared helper, the focused test and this report. No commits were created.

## Limits and handoff

The focused package fixture uses a minimal CLI protocol implementation and deliberately constructed successful preflight evidence so the tests exercise the release gate without recursively running preflight. The actual application test/build/smoke/package pipeline remains the root agent's final integration step. This patch does not claim a fresh full application run, hosted CI or Windows verification.

Fingerprints identify content within this trusted local release workflow; they are not signatures or an authorization mechanism. Packaging assumes the checkout is not concurrently edited while it reads and archives files. A terminated verifier can leave a non-success `running` report, which packaging correctly refuses. As with other file writes, a filesystem that refuses evidence writes cannot be made to persist a failure record.
