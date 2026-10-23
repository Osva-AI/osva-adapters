# Implementation tracker

| ID   | Package                            | Status               | Notes                                                         |
| ---- | ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| A0   | Repository foundation              | **Done**             | pnpm workspace, Apache-2.0, ESLint, Prettier, Vitest          |
| A1.1 | `@osva-ai/adapter-artifact-memory` | **Done (reference)** | In-memory `ArtifactBlobStore`; not production durable storage |
| A1.2 | `@osva-ai/adapter-artifact-azure`  | Planned              | Production blob backend                                       |
| A2.x | External agent CLI runtimes        | Planned              | Codex, Claude Code, Gemini CLI—out of A1.1 scope              |

## Verification (A1.1)

- [x] Unit tests (write/open/delete, digests, limits, isolation)
- [x] Pack + external consumer typecheck/smoke
- [x] Independent build/typecheck/lint
