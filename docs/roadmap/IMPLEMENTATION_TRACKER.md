# Implementation tracker

| ID   | Package                                   | Status                | Notes                                                         |
| ---- | ----------------------------------------- | --------------------- | ------------------------------------------------------------- |
| A0   | Repository foundation                     | **Done**              | pnpm workspace, Apache-2.0, ESLint, Prettier, Vitest          |
| A1.1 | `@osva-ai/adapter-artifact-memory`        | **Done (reference)**  | In-memory `ArtifactBlobStore`; not production durable storage |
| A1.2 | `@osva-ai/adapter-artifact-azure`         | **Done (adapter)**    | Azure Blob `ArtifactBlobStore`; A1.4 deployment harness done  |
| A1.3 | Contracts RC3 compatibility               | **Done**              | `@osva-ai/contracts@1.1.0-rc.3` from npm; patch removed       |
| A1.4 | OSVA deployment acceptance (Azure)        | **Done (harness)**    | Docker Compose + Azurite cross-process harness                |
| A1.5 | npm release preparation                   | **Done (prep)**       | CI, pack inspect, `verify:a1-5`, manual publish workflow      |
| A2.0 | External agent runtime architecture audit | **Done (docs)**       | See `docs/architecture/EXTERNAL_AGENT_RUNTIME_*.md`           |
| A2.1 | `@osva-ai/runtime-cli-sidecar`            | **Done (foundation)** | Runtime Protocol V1 sidecar; fixture CLI + pack consumer      |
| A2.2 | Gemini CLI backend                        | **Done (adapter)**    | `createGeminiCliProvider`; fixture + conformance tests        |
| A2.3 | Codex CLI backend                         | **Done (adapter)**    | JSONL parser; default `read-only` sandbox                     |
| A2.4 | Claude Code backend                       | **Done (adapter)**    | `--bare` + JSON output mapping                                |
| A2.5 | Cross-runtime conformance + acceptance    | **Done (harness)**    | `pnpm test:acceptance:a2-5`; OSVA RC3 + sidecar Compose       |
| A2.6 | npm release readiness (runtime adapters)  | **Done (prep)**       | `pnpm test:release-readiness:a2-6`; publish BLOCKED on Zod    |

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
- [x] Document CLI interface baselines in adapter docs (operator pins binary in OCI image)

## Verification (A2.1)

- [x] `@osva-ai/runtime-cli-sidecar` package (SDK runtime handler + injectable CLI provider)
- [x] Hermetic Vitest (protocol validation, timeout, dedupe, auth, path traversal, redaction)
- [x] Deterministic fixture CLI subprocess coverage
- [x] External npm pack consumer (`pnpm test:pack-consumer:a2-1`)
- [x] Architecture + security docs (`CLI_SIDECAR_DESIGN.md`, `CLI_SIDECAR_SECURITY.md`)
- [x] Live OSVA REMOTE_HTTP end-to-end (A2.5 Docker harness; fixture-backed CLIs)

## Verification (A2.5)

- [x] Docker Compose + OSVA v1.1.0-rc.3 worker → sidecar → fixture/gemini/codex/claude fixtures
- [x] RunAttempt SUCCEEDED/FAILED persistence via public API
- [x] Transport + identity security scenarios (deployment HTTP)
- [x] Evidence JSON (`scripts/acceptance/a2-5/evidence/latest.json`)
- [ ] Live vendor CLI (operator credentials; NOT RUN)

## Verification (A2.6)

- [x] `scripts/acceptance/a2-6/release-readiness.mjs`
- [x] CI: sidecar quality gates + A2.6 job + optional A2.5 Docker smoke
- [x] `publish-package.yml` selector for `@osva-ai/runtime-cli-sidecar`
- [x] OCI Dockerfile under `packages/runtime-cli-sidecar`
- [ ] npm publish (BLOCKED: zod@4.6.5 / GHSA-mrhx-c7xc-m3w5 until upstream RC fix)
