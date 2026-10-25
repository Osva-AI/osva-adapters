# Maintainer release procedure (A1.5)

Independent npm packages under `@osva-ai/*`. **Publication is manual** via GitHub Actions only.

## Packages

| npm package                        | Directory                  | Initial version |
| ---------------------------------- | -------------------------- | --------------- |
| `@osva-ai/adapter-artifact-memory` | `packages/artifact-memory` | `0.1.0`         |
| `@osva-ai/adapter-artifact-azure`  | `packages/artifact-azure`  | `0.1.0`         |
| `@osva-ai/runtime-cli-sidecar`     | `packages/runtime-cli-sidecar` | `0.1.0`     |

Versions are **independent** unless a release note documents a coordinated bump.

## Prepublication verification (required)

On `main` (or the semver tag you will publish):

```bash
pnpm install --frozen-lockfile
pnpm verify:a1-5
```

For the CLI runtime sidecar:

```bash
pnpm test:release-readiness:a2-6
```

This runs `release-readiness.mjs --require-a25` (Docker + OSVA RC3 worker acceptance required).

Optional higher-level gate (Docker + OSVA `v1.1.0-rc.3`):

```bash
node scripts/acceptance/a1-4/run.mjs
node scripts/acceptance/a2-5/run.mjs
```

## GitHub environment protection

1. In GitHub → **Settings → Environments**, create **`npm-publish`**.
2. Enable **Required reviewers** (at least one maintainer).
3. Optionally restrict deployment branches to **`main`** and **`v*`** tags only.
4. The publish workflow job sets `environment: npm-publish`, so every run waits for approval after checks pass.

No secrets appear in workflow logs; do not echo `NPM_TOKEN` or connection strings in custom steps.

## npm authentication

Use **one** of these models (OIDC preferred):

### A. Trusted publishing (recommended)

Requirements ([npm docs](https://docs.npmjs.com/trusted-publishers/)):

- **GitHub-hosted runners** (not self-hosted).
- **npm CLI ≥ 11.5.1** and **Node ≥ 22.14** (CI uses Node 24).
- On **npmjs.com** → package → **Trusted Publisher** → GitHub Actions:
  - Organization/user: `Osva-AI`
  - Repository: `osva-adapters`
  - Workflow filename: **`publish-package.yml`** (exact)
  - Environment name: **`npm-publish`** (must match the workflow environment)
- Workflow permissions include `id-token: write` and `contents: read`.
- **Do not** set `NODE_AUTH_TOKEN` / `NPM_TOKEN` when OIDC is configured; `setup-node` + `npm publish` uses short-lived OIDC credentials.

**First publication note:** npm trusted publishing applies to packages that already exist or are created through an authorized publish. If the package name has never been published, you may need a **one-time** manual publish or granular token to create the package, then attach the trusted publisher for all subsequent releases.

### B. Token-based publishing (fallback)

1. Create a **granular** npm access token with publish scope for `@osva-ai` (respect npm’s short max lifetime).
2. Store it as repository secret **`NPM_TOKEN`**.
3. The workflow uses `NODE_AUTH_TOKEN` only when the secret is present and adds `--provenance` for token publishes.

If neither trusted publishing nor `NPM_TOKEN` is configured, the publish step fails at registry authentication.

## Dist-tag policy

| Tag      | Use case                                                                   |
| -------- | -------------------------------------------------------------------------- |
| **`rc`** | **Default in workflow.** First public **`0.1.0`** while OSVA uses RC3.     |
| `latest` | Stable default install tag; requires typing **`YES`** in `confirm_latest`. |
| `next`   | Pre-release channel                                                        |
| `beta`   | Beta channel                                                               |
| `alpha`  | Alpha channel                                                              |

`npm dist-tag add` is **not** run by this workflow except via `npm publish --tag`. Accidental `latest` is blocked unless `confirm_latest: YES`.

Consumers pinning contracts:

```bash
npm install @osva-ai/adapter-artifact-azure@0.1.0 @osva-ai/contracts@1.1.0-rc.3
```

## First public publication procedure

1. Merge release-prep PR to **`main`** with version **`0.1.0`** in the target `package.json` (unchanged unless documented).
2. Confirm npm 404: `npm view @osva-ai/adapter-artifact-azure` (repeat per package).
3. Run **`pnpm verify:a1-5`** locally or wait for **CI** on `main`.
4. (Optional) Run **A1.4** deployment acceptance.
5. GitHub → **Actions → Publish npm package → Run workflow**:
   - Branch: **`main`** (or tag **`v0.1.0`** after tagging that commit).
   - **package:** one adapter only.
   - **expected_version:** `0.1.0`
   - **dist_tag:** `rc` (recommended first).
   - **confirm_latest:** leave empty unless using `latest`.
6. Approve the **`npm-publish`** environment deployment.
7. Workflow verifies tarball, publishes **one** package directory, then **post-publication registry check**.
8. Repeat steps 5–7 for the second adapter if needed (independent versions).

## Workflow security summary

- Trigger: **`workflow_dispatch` only**.
- Package choice: enum of the two adapters only.
- Ref: **`main`** or semver tag **`v*.*.*`**; tag must equal **`v{expected_version}`**.
- Checkout: pinned to **`github.sha`** with clean tree check.
- Build / pack / inspect: **selected package only** (`prepublish-package.mjs`).
- Registry: abort if version already exists.

## Rollback limitations

- **Unpublish** is time-limited on npm and discouraged for public adapters.
- Prefer **`npm deprecate @osva-ai/adapter-artifact-azure@0.1.0 "reason"`** and ship **`0.1.1`**.
- Consumers must **pin** versions in deployment images; dist-tags alone are not enough for production.

## Post-publication registry verification

The workflow runs:

```bash
npm view <package>@<version> version
```

Manually confirm dist-tag:

```bash
npm view @osva-ai/adapter-artifact-azure dist-tags --json
```

Verify tarball contents once:

```bash
npm pack @osva-ai/adapter-artifact-azure@0.1.0 --dry-run
```

## Failure recovery and partial publication

| Situation                         | Recovery                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| CI failed before merge            | Fix and re-run CI; do not publish.                                         |
| Publish failed before npm upload  | Fix auth/config; re-run workflow (version still unpublished).              |
| One adapter published, second not | Publish the remaining package in a **separate** workflow run.              |
| Wrong dist-tag                    | `npm dist-tag add <pkg>@<version> rc` (maintainer token); document change. |
| Bad tarball after publish         | Deprecate version; publish patch; update consumer pins.                    |

Evidence files under `scripts/acceptance/*/evidence/` are gitignored and must not contain secrets.

## Security boundaries

- No committed secrets; runtime Azure credentials via operator env only.
- No runtime adapter discovery.
- Do not recommend memory adapter for multiprocess production.
- Azurite / A1.4 does not prove real Azure production readiness.
