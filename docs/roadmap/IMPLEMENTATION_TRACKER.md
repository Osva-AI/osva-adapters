# Implementation tracker

| ID   | Package                            | Status               | Notes                                                         |
| ---- | ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| A0   | Repository foundation              | **Done**             | pnpm workspace, Apache-2.0, ESLint, Prettier, Vitest          |
| A1.1 | `@osva-ai/adapter-artifact-memory` | **Done (reference)** | In-memory `ArtifactBlobStore`; not production durable storage |
| A1.2 | `@osva-ai/adapter-artifact-azure`  | **Done (adapter)**   | Azure Blob `ArtifactBlobStore`; OSVA deployment E2E pending   |
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
- [ ] OSVA core M12.4.x registered-driver acceptance in deployment image
