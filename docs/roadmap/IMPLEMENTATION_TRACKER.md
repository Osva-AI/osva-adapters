# Implementation tracker

| ID   | Package                            | Status               | Notes                                                         |
| ---- | ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| A0   | Repository foundation              | **Done**             | pnpm workspace, Apache-2.0, ESLint, Prettier, Vitest          |
| A1.1 | `@osva-ai/adapter-artifact-memory` | **Done (reference)** | In-memory `ArtifactBlobStore`; not production durable storage |
| A1.2 | `@osva-ai/adapter-artifact-azure`  | **Done (adapter)**   | Azure Blob `ArtifactBlobStore`; OSVA deployment E2E pending   |
| A1.3 | Contracts RC3 compatibility        | **Done**             | `@osva-ai/contracts@1.1.0-rc.3` from npm; patch removed       |
| A1.4 | OSVA deployment acceptance (Azure) | **Done (harness)**   | Docker Compose + Azurite cross-process harness                |
| A2.x | External agent CLI runtimes        | Planned              | Codex, Claude Code, Gemini CLI—out of A1.1 scope              |

## Verification (A1.1)

- [x] Unit tests (write/open/delete, digests, limits, isolation)
- [x] Pack + external consumer typecheck/smoke
- [x] Independent build/typecheck/lint

## Verification (A1.2)

- [x] Hermetic unit tests (mocked Azure container client)
- [x] Azurite integration tests (opt-in via `OSVA_ARTIFACT_AZURE_INTEGRATION=1`)
- [x] Pack + external consumer smoke (Azurite)
- [x] Independent build/typecheck/lint
- [ ] OSVA core M12.4.x registered-driver acceptance in deployment image (see A1.4)

## Verification (A1.4)

- [x] Docker Compose stack with registered Azure adapter + Azurite (`pnpm test:acceptance:a1-4`)
- [x] Module resolution from `@osva/adapters-artifact-storage` loader context (web / worker / knowledge-worker)
- [x] Cross-process artifact + knowledge ingestion evidence (`scripts/acceptance/a1-4/evidence/latest.json`)
- [x] Negative startup (invalid module, bad Azure config) and log secret scan
- [ ] Real Azure Storage acceptance (operator environment; deferred)

## Verification (A1.3)

- [x] `@osva-ai/contracts@1.1.0-rc.3` from npm (no pnpm patch)
- [x] Pack-consumer scripts install official registry contracts tarball
- [x] A1.1 and A1.2 workspace build, test, and external consumer smoke
