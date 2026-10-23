# Engineering verification playbook

Use this checklist when landing adapter slices in **osva-adapters**. It mirrors A1.1 verification and extends it for durable backends.

## 1. Impact inventory

- List new/changed packages, scripts, docs, and lockfile/catalog updates.
- Confirm scope stays within public `@osva-ai/contracts` ports (no OSVA core imports).
- Note compatibility blockers (npm contracts gap, patch requirements).

## 2. Formatting

```bash
pnpm format
pnpm format:check
```

## 3. Package quality gates

Per affected package:

```bash
pnpm --filter <package> lint
pnpm --filter <package> typecheck
pnpm --filter <package> build
pnpm --filter <package> test
```

## 4. Integration (when applicable)

- Start local dependencies (for example Azurite via `docker compose`).
- Run focused integration tests with an explicit env flag (for example `OSVA_ARTIFACT_AZURE_INTEGRATION=1`).

## 5. External consumer

```bash
pnpm test:pack-consumer        # A1.1
pnpm test:pack-consumer:a1-2   # A1.2
```

## 6. Root verification script

```bash
pnpm verify:a1-1   # memory reference
pnpm verify:a1-2   # Azure adapter slice
```

## 7. Whitespace

```bash
git diff --check
```

Include newly added files in the diff review.

## Out of scope locally

- Full OSVA core CI or cross-repo acceptance (M12.4.x) — track as remaining integration checks in the handoff.
