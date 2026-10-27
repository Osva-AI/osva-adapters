# A2.5 + A2.6 engineering sprint — progress checkpoint

**Branch:** `feat/a2-5-6-deployment-release-readiness`
**Updated:** 2026-10-25
**Repository:** Osva-AI/osva-adapters

## Slice checklist

| Slice   | Description                                       | Status                              |
| ------- | ------------------------------------------------- | ----------------------------------- |
| Phase 0 | Source/contract audit, OSVA REMOTE_HTTP wiring    | **Done**                            |
| A2.5.1  | Deployment harness design + Compose topology      | **Done**                            |
| A2.5.2  | Real OSVA worker → sidecar → fixture execution    | **Done**                            |
| A2.5.3  | Gemini / Codex / Claude fixture deployment matrix | **Done**                            |
| A2.5.4  | Lifecycle (restart, dedupe, failure)              | **Done** (subset; see final report) |
| A2.5.5  | Security negative tests                           | **Done** (unit + deployment HTTP)   |
| A2.5.6  | Evidence + CLI_PROVIDER_CONFORMANCE matrix        | **Done**                            |
| A2.6.1  | Public package review                             | **Done**                            |
| A2.6.2  | External consumer + pack verification             | **Done**                            |
| A2.6.3  | CI + publish workflow + OCI Dockerfile            | **Done**                            |
| A2.6.4  | Operator documentation                            | **Done**                            |
| A2.6.5  | Release security gate (Zod GHSA)                  | **Done** (publication BLOCKED)      |
| A2.6.6  | Manual release handoff                            | **Done** (no publish executed)      |

## Phase 0 notes

- Worker path: `REMOTE_HTTP` → `http://cli-sidecar:9321/execute`, Protocol V1.
- `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` in Compose only (A1.4 pattern).
- Capability tokens redacted; deployment scan PASS.

## Verification executed (this run)

| Command                                                                       | Result                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @osva-ai/runtime-cli-sidecar test`                             | **PASS** (43 tests)                       |
| `node scripts/acceptance/a2-6/release-readiness.mjs`                          | **PASS** (npm publication BLOCKED on Zod) |
| `node scripts/acceptance/a2-5/run.mjs` (Docker, `OSVA_A25_SKIP_BASE_BUILD=1`) | **PASS**                                  |

## Files added (A2.5 / A2.6 slice)

- `scripts/acceptance/a2-5/**` — Compose, Dockerfiles, `run.mjs`, evidence schema
- `scripts/acceptance/a2-6/release-readiness.mjs`
- `packages/runtime-cli-sidecar/Dockerfile`
- `packages/runtime-cli-sidecar/test/conformance.test.ts`, `security.test.ts`
- `docs/acceptance/A2_5_INTEGRATION_DESIGN.md`
- `docs/operations/A2_5_6_*`

## Known blockers

- **npm publication:** `zod@4.6.5` via RC3 `@osva-ai/*` (GHSA-mrhx-c7xc-m3w5) — requires upstream OSVA package release with `zod>=4.6.6`.
- **Live vendor CLI:** NOT RUN (fixtures only).

## Next action (maintainer)

- Merge implementation PR when ready.
- Manual npm publish via workflow after upstream Zod remediation (or documented exception).
