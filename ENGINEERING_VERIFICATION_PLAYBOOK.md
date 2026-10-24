# Engineering verification playbook

Use this checklist when landing adapter slices in **osva-adapters**. It mirrors A1.1 verification and extends it for durable backends.

## 1. Impact inventory

- List new/changed packages, scripts, docs, and lockfile/catalog updates.
- Confirm scope stays within public `@osva-ai/contracts` ports (no OSVA core imports).
- Note compatibility blockers (registry `@osva-ai/contracts` version, required public exports).

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

Unit tests (`pnpm --filter <package> test`) are hermetic and fast. External npm pack-consumer acceptance is **not** run inside Vitest; use section 5 and `pnpm verify:a1-5` / release-readiness instead.

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
pnpm verify:a1-4   # OSVA deployment acceptance (Docker + Azurite; opt-in heavy)
pnpm verify:a1-5   # Release readiness (pack + external consumer; no npm publish)
```

A1.4 deployment acceptance requires Docker and an OSVA `v1.1.0-rc.3` source tree (or ephemeral clone). See [scripts/acceptance/a1-4/README.md](./scripts/acceptance/a1-4/README.md).

A1.5 release readiness (`pnpm verify:a1-5`) intentionally skips whole-repo Prettier (use `pnpm format:check` separately when reformatting). See [scripts/acceptance/a1-5/README.md](./scripts/acceptance/a1-5/README.md).

## 7. Whitespace

```bash
git diff --check
```

Include newly added files in the diff review.

## Out of scope locally

- Full OSVA core CI or cross-repo acceptance (M12.4.x) — track as remaining integration checks in the handoff.
