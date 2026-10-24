# Implementation tracker

| ID   | Package                                   | Status               | Notes                                                         |
| ---- | ----------------------------------------- | -------------------- | ------------------------------------------------------------- |
| A0   | Repository foundation                     | **Done**             | pnpm workspace, Apache-2.0, ESLint, Prettier, Vitest          |
| A1.1 | `@osva-ai/adapter-artifact-memory`        | **Done (reference)** | In-memory `ArtifactBlobStore`; not production durable storage |
| A1.2 | `@osva-ai/adapter-artifact-azure`         | **Done (adapter)**   | Azure Blob `ArtifactBlobStore`; A1.4 deployment harness done  |
| A1.3 | Contracts RC3 compatibility               | **Done**             | `@osva-ai/contracts@1.1.0-rc.3` from npm; patch removed       |
| A1.4 | OSVA deployment acceptance (Azure)        | **Done (harness)**   | Docker Compose + Azurite cross-process harness                |
| A1.5 | npm release preparation                   | **Done (prep)**      | CI, pack inspect, `verify:a1-5`, manual publish workflow      |
| A2.0 | External agent runtime architecture audit | **Done (docs)**      | See `docs/architecture/EXTERNAL_AGENT_RUNTIME_*.md`           |
| A2.1 | Minimal reference CLI runtime sidecar     | Planned              | Runtime Protocol V1 sidecar; no vendor CLI in unit tests      |
| A2.2 | Gemini CLI backend                        | Planned              | First agent by verified headless / JSON feasibility           |
| A2.3 | Codex CLI backend                         | Planned              | `codex exec --json`                                           |
| A2.4 | Claude Code backend                       | Planned              | `claude -p` / JSON output                                     |
| A2.5 | Cross-runtime conformance + acceptance    | Planned              | Extend A1.4-style harness                                     |
| A2.6 | npm release readiness (runtime adapters)  | Planned              | Mirror A1.5 gates                                             |

## Verification (A1.1)

- [x] Unit tests (write/open/delete, digests, limits, isolation)
- [x] Pack + external consumer typecheck/smoke
- [x] Independent build/typecheck/lint

## Verification (A1.2)

- [x] Hermetic unit tests (mocked Azure container client)
- [x] Azurite integration tests (opt-in via `OSVA_ARTIFACT_AZURE_INTEGRATION=1`)
- [x] Pack + external consumer smoke (Azurite)
- [x] Independent build/typecheck/lint
- [x] OSVA core M12.4.x registered-driver acceptance in deployment image (A1.4 harness)

## Verification (A1.4)

- [x] Docker Compose stack with registered Azure adapter + Azurite (`pnpm test:acceptance:a1-4`)
- [x] Module resolution from `@osva/adapters-artifact-storage` loader context (web / worker / knowledge-worker)
- [x] Cross-process artifact + knowledge ingestion evidence (`scripts/acceptance/a1-4/evidence/latest.json`)
- [x] Negative startup (invalid module, bad Azure config) and log secret scan
- [ ] Real Azure Storage acceptance (operator environment; deferred)

## Verification (A1.5)

- [x] GitHub Actions CI (lint, typecheck, build, unit tests, pack inspect, external consumers)
- [x] Bounded Azurite integration job (opt-in env in package tests)
- [x] Manual `publish-package` workflow (package selector, version gate, npm 404 check)
- [x] `pnpm verify:a1-5` / `scripts/acceptance/a1-5/release-readiness.mjs`
- [x] Maintainer release documentation
- [ ] First npm publish (maintainer action; requires `@osva-ai` npm access + `npm-publish` environment)

## Verification (A1.3)

- [x] `@osva-ai/contracts@1.1.0-rc.3` from npm (no pnpm patch)
- [x] Pack-consumer scripts install official registry contracts tarball
- [x] A1.1 and A1.2 workspace build, test, and external consumer smoke

## Verification (A2.0)

- [x] Architecture inventory with file-level references (osva + osva-adapters)
- [x] External CLI research (Codex, Claude Code, Gemini) with verified vs unverified markers
- [x] Integration strategy recommendation (REMOTE_HTTP sidecar hybrid)
- [x] Security model and contract gap analysis
- [x] A2.1–A2.6 roadmap documented
- [x] `git diff --check` (documentation-only)
- [ ] Pin CLI versions in docs when A2.2+ implementation starts (deferred)
