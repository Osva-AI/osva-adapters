# Contributing

Thank you for helping build OSVA adapters.

## Scope

- Implement **public** ports from `@osva-ai/contracts` only.
- Do not import OSVA core internals (`@osva/domain`, `@osva/db`, apps, etc.).
- Do not duplicate **osva-connectors** (MCP/API tools) or **osva-examples**.

## Development setup

Requirements: Node.js `>=24`, pnpm `12.x`.

```bash
pnpm install
pnpm --filter @osva-ai/adapter-artifact-memory build
pnpm --filter @osva-ai/adapter-artifact-azure build
```

Use `pnpm format` before opening a PR.

## Tests

- Unit tests: Vitest under each package.
- Pack consumer: `pnpm test:pack-consumer` (clean temp directory outside the workspace).

## Pull requests

- Keep changes focused; one adapter slice per PR when possible.
- Update `COMPATIBILITY.md` and package README when contract or behavior changes.
- Do not commit secrets or environment files with credentials.

## License

Contributions are accepted under the Apache-2.0 license.
