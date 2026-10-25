# A2.5 + A2.6 — final engineering report

**Branch:** `feat/a2-5-6-deployment-release-readiness`
**Date:** 2026-10-25
**Publication:** PENDING MANUAL RELEASE (no npm / GHCR / git writes in this run)

---

## 1. A2.5 architecture and impact inventory

| Area | Change |
| ---- | ------ |
| Deployment harness | `scripts/acceptance/a2-5/` — Compose project `osva-a25`, sidecar image + OSVA RC3 stack |
| Design doc | `docs/acceptance/A2_5_INTEGRATION_DESIGN.md` |
| Sidecar tests | `conformance.test.ts`, `security.test.ts` |
| Evidence | `scripts/acceptance/a2-5/evidence/latest.json` (gitignored) |
| Operator docs | Sidecar README, conformance matrix, playbook §8 |
| CI | Sidecar lint/typecheck/test; A2.5 Docker job; A2.6 release readiness job |

No OSVA core modifications.

---

## 2. OSVA worker deployment topology

```text
web / worker / knowledge-worker / scheduler / workflow-orchestrator
postgres, valkey, azurite (+ init), registered @osva-ai/adapter-artifact-azure
cli-sidecar:9321  ← REMOTE_HTTP POST /execute
```

Worker env: `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true`, capability server on worker `:44995`.

Sidecar: fixture-backed Gemini/Codex/Claude via `sidecar-entrypoint.mjs` (no live vendor APIs).

---

## 3–5. Provider deployment results (fixture-backed)

| Provider | Worker E2E | Worker failure | Notes |
| -------- | ---------- | -------------- | ----- |
| fixture | PASS | PASS | RunAttempt SUCCEEDED / FAILED |
| gemini | PASS | PASS | ~1s duration |
| codex | PASS | PASS | |
| claude | PASS | PASS | |

Evidence execution IDs in `scripts/acceptance/a2-5/evidence/latest.json`.

---

## 6. RunAttempt persistence

Worker runs polled to terminal state; attempts fetched via `/v1/runs/{id}/attempts/{attemptId}`. All provider success paths: run status **SUCCEEDED**, verification **RunAttempt persisted SUCCEEDED**.

---

## 7–8. Cancellation, timeout, crash/restart

| Scenario | Layer | Result |
| -------- | ----- | ------ |
| Sidecar restart | Deployment | PASS |
| Duplicate executionId coalesce | HTTP + unit | PASS |
| Conflicting duplicate input | HTTP + unit | PASS |
| Execution deadline / hang | Unit (`sidecar.test.ts`) | PASS |
| Worker cancel → sidecar | — | **NOT IMPLEMENTED** in OSVA RemoteHttp (documented gap) |
| Sidecar crash mid-flight | — | **NOT RUN** (heavy; dedupe after restart documented as best-effort) |

---

## 9. Security negative-path results

| Test | Result |
| ---- | ------ |
| Invalid protocol version | PASS (deployment + unit) |
| Malformed JSON | PASS |
| Conflicting executionId | PASS |
| Provider/command override in input | PASS (gemini provider) |
| Auth Bearer (unit) | PASS |
| Draining / 503 | PASS (unit) |
| Oversized body | PASS (unit) |
| Capability token log scan | PASS |

---

## 10. SSRF configuration evidence

Compose sets `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` for private sidecar URL only. No global SSRF disable. Documented in A2_5_INTEGRATION_DESIGN and CLI_SIDECAR_SECURITY.

---

## 11. Credential isolation evidence

- Capability probe token not found in `cli-sidecar` or `worker` logs (deployment scan PASS).
- Vendor API keys not used in acceptance (fixtures only).

---

## 12. Observability artifacts

- Schema: `scripts/acceptance/a2-5/evidence-schema.json`
- Latest run: `scripts/acceptance/a2-5/evidence/latest.json`
- A2.6 gate: `scripts/acceptance/a2-6/evidence/latest.json`

---

## 13. Package readiness (`@osva-ai/runtime-cli-sidecar@0.1.0`)

| Check | Status |
| ----- | ------ |
| name / version / exports / bin | OK |
| `files`: dist, fixtures, README | OK |
| engines node >=24 | OK |
| dependencies pinned 1.1.0-rc.3 | OK |
| Tarball inspect (107 entries) | PASS |
| workspace:/catalog: in packed deps | PASS (external install) |

npm registry: **not verified published** (manual release only).

---

## 14. CI changes

- `quality` job includes runtime-cli-sidecar lint/typecheck/test
- `pack-and-release-readiness`: a2-2-4 pack consumer
- New: `runtime-sidecar-release-readiness` (A2.6 script)
- New: `a25-deployment-smoke` (Docker, `continue-on-error: true`)

---

## 15. Docker image readiness

| Image | Purpose | Status |
| ----- | ------- | ------ |
| `Dockerfile.runtime-cli-sidecar` | A2.5 acceptance | Built and exercised |
| `packages/runtime-cli-sidecar/Dockerfile` | Operator OCI | Builds locally; **not pushed** |

---

## 16. Publication workflow readiness

`publish-package.yml` includes `@osva-ai/runtime-cli-sidecar`. Prepublish uses extended `publish-single-package.mjs` (sidecar export + bin check).

---

## 17. Dependency audit

- Lockfile resolves **zod@4.6.5** (transitive via RC3 packages).
- External consumer `npm audit`: exit code 1 (5 high — Zod advisory chain).

---

## 18. Upstream Zod remediation

| Item | Value |
| ---- | ----- |
| Advisory | GHSA-mrhx-c7xc-m3w5 |
| Resolved | zod@4.6.5 |
| Patched | zod >= 4.6.6 |
| Path | @osva-ai/contracts, sdk, runtime-protocol → zod |
| Action | Wait for OSVA RC npm release; do not force-break RC3 pins in adapters |

---

## 19. Verification commands and results

```bash
pnpm --filter @osva-ai/runtime-cli-sidecar test          # PASS (43)
node scripts/acceptance/a2-6/release-readiness.mjs       # PASS (npm BLOCKED)
node scripts/acceptance/a2-5/run.mjs                     # PASS (Docker)
```

---

## 20. Tests skipped or blocked

| Item | Status |
| ---- | ------ |
| Live Gemini/Codex/Claude vendor APIs | NOT RUN |
| npm publish | BLOCKED (manual + Zod) |
| GHCR sidecar push | BLOCKED (manual) |
| Full lifecycle matrix (sidecar crash, worker interrupt) | Partial / unit-only |

---

## 21. Known limitations

- In-memory dedupe only; restart may re-execute same executionId.
- Worker does not forward cancel to REMOTE_HTTP.
- Fixture CLIs do not prove live vendor compatibility.
- Memory artifact adapter not used; Azure+Azurite retained for cross-process parity with A1.4.

---

## 22. Intentional file changes (this sprint)

See progress doc and new paths under `scripts/acceptance/a2-5`, `a2-6`, sidecar tests/Dockerfile, docs.

---

## 23. Unrelated file changes

Working tree contains additional modified files on the branch (artifact-azure, a1-4 scripts, etc.) from prior work — not all re-validated in this run.

---

## 24. Implementation PR readiness

**READY** — A2.5 deployment acceptance passed locally; A2.6 gates pass except publication blockers.

---

## 25. npm publication readiness

**BLOCKED** — Zod GHSA via pinned RC3 dependencies; maintainer must confirm registry + advisory posture before `publish-package` workflow.

---

## 26. Manual maintainer release checklist

1. Merge to `main` on approved PR.
2. Run `pnpm verify:a2-6` on release ref.
3. Run `pnpm test:acceptance:a2-5` with Docker (optional but recommended).
4. Confirm upstream `@osva-ai/*` resolves Zod advisory or document accepted risk.
5. Bump version if needed; tag `v*` if using tag-based publish.
6. Dispatch **Publish npm package** → `@osva-ai/runtime-cli-sidecar`, version `0.1.0`, dist-tag `rc`.
7. Approve `npm-publish` environment.
8. Post-publish: `npm view`, external install smoke (`a2-2-4-pack-consumer.mjs`).
9. (Optional) Build/push OCI image to operator registry — not automated here.
10. Rollback: deprecate dist-tag / publish patch; redeploy previous sidecar image digest.

**NOT READY FOR PUBLICATION** until Zod/upstream RC remediation is addressed or explicitly waived by maintainers.
