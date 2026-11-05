# Maintainer release procedure (A1.5 / A2.6)

Independent npm packages under `@osva-ai/*`. **Publication is manual** via GitHub Actions only.

## Release candidates (M19)

| npm package                        | Directory                      | Target version | Contracts line | Registry status (verify before publish)                  |
| ---------------------------------- | ------------------------------ | -------------- | -------------- | -------------------------------------------------------- |
| `@osva-ai/adapter-artifact-memory` | `packages/artifact-memory`     | **0.1.2**      | **1.1.4**      | **0.1.2** not published (latest **0.1.0**, rc **0.1.1**) |
| `@osva-ai/adapter-artifact-azure`  | `packages/artifact-azure`      | **0.1.2**      | **1.1.4**      | **0.1.2** not published (latest **0.1.0**, rc **0.1.1**) |
| `@osva-ai/runtime-cli-sidecar`     | `packages/runtime-cli-sidecar` | **0.1.0**      | **1.1.4**      | Package **404** (first publication)                      |

Versions are **independent** unless a release note documents a coordinated bump.

### Status vocabulary

| Status               | Meaning                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| **package-ready**    | Version bumped in git, CI green, local/CI pack gates pass for that slice.                                    |
| **preflight-passed** | **Publish npm package** workflow completed with empty `confirm_real_publish` (dry-run + pack artifact only). |
| **published**        | Workflow completed with `confirm_real_publish=PUBLISH`, registry reports the version.                        |

## Registry verification (required before each release)

Do not rely on historical docs; query npm at release time:

```bash
npm view @osva-ai/adapter-artifact-memory version dist-tags --json
npm view @osva-ai/adapter-artifact-azure version dist-tags --json
npm view @osva-ai/runtime-cli-sidecar version dist-tags --json
npm view @osva-ai/adapter-artifact-memory@0.1.2 version   # expect 404 until published
npm view @osva-ai/adapter-artifact-azure@0.1.2 version    # expect 404 until published
npm view @osva-ai/runtime-cli-sidecar@0.1.0 version       # expect 404 until first publish
```

## Prepublication verification (required)

On `main` (or the semver tag you will publish):

```bash
pnpm install --frozen-lockfile
pnpm verify:a1-5
```

For the CLI runtime sidecar (pack / audit / unit only):

```bash
node scripts/acceptance/a2-6/release-readiness.mjs
```

**Strict** sidecar publication gate (includes A2.5 Docker + OSVA worker harness):

```bash
pnpm test:release-readiness:a2-6
```

That script passes **`--require-a25`**. The default harness worker image is git tag **`v1.1.0-rc.4`**; npm adapters pin **`@osva-ai/contracts@1.1.4`**. The latest OSVA **platform** GitHub release is **`v1.1.1`** — distinct from npm contracts **1.1.4**.

Optional deployment gates (Docker):

```bash
node scripts/acceptance/a1-4/run.mjs
node scripts/acceptance/a2-5/run.mjs
```

Per-package prepublish (matches the GitHub preflight job):

```bash
node scripts/acceptance/a1-5/prepublish-package.mjs @osva-ai/adapter-artifact-memory 0.1.2
node scripts/acceptance/a1-5/prepublish-package.mjs @osva-ai/adapter-artifact-azure 0.1.2
node scripts/acceptance/a1-5/prepublish-package.mjs @osva-ai/runtime-cli-sidecar 0.1.0
```

## GitHub environment protection

1. In GitHub → **Settings → Environments**, create **`npm-publish`**.
2. Enable **Required reviewers** (at least one maintainer).
3. Optionally restrict deployment branches to **`main`** and **`v*`** tags only.
4. Only the **`publish`** job (real upload) uses `environment: npm-publish`. The default **preflight** job does **not** touch npm credentials.

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
  - Environment name: **`npm-publish`** (must match the **publish** job environment)
- Workflow permissions include `id-token: write` and `contents: read`.
- **Do not** set `NODE_AUTH_TOKEN` / `NPM_TOKEN` when OIDC is configured; `setup-node` + `npm publish` uses short-lived OIDC credentials.

**Existing adapter packages (`adapter-artifact-memory`, `adapter-artifact-azure`):** If trusted publishing is already configured on npm for these package names, OIDC publish works for **0.1.2** without a long-lived token. Confirm on npmjs.com → each package → **Trusted Publisher** (operator action if missing).

**First publication (`@osva-ai/runtime-cli-sidecar`):** npm trusted publishing attaches to an **existing** package. Safest bootstrap:

1. Complete **preflight** in Actions (default; no upload).
2. Maintainer performs **one-time** authenticated publish of **0.1.0** using either:
   - A **granular** npm token stored as `NPM_TOKEN` (workflow fallback, `--provenance`), **or**
   - Manual `npm publish` from a maintainer machine with 2FA (same tarball checks as preflight).
3. On npmjs.com, add **Trusted Publisher** for `runtime-cli-sidecar` pointing at **`publish-package.yml`** and environment **`npm-publish`**.
4. Remove or rotate `NPM_TOKEN` if OIDC alone is desired for subsequent releases.

Do **not** commit tokens or print credentials in logs.

### B. Token-based publishing (fallback)

1. Create a **granular** npm access token with publish scope for `@osva-ai` (respect npm’s short max lifetime).
2. Store it as repository secret **`NPM_TOKEN`**.
3. The **publish** job uses `NODE_AUTH_TOKEN` only when the secret is present and adds `--provenance` for token publishes.

If neither trusted publishing nor `NPM_TOKEN` is configured, the publish step fails at registry authentication.

## Dist-tag policy

| Tag      | Use case                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------- |
| **`rc`** | Pre-stable channel; recommended for **0.1.2** artifact adapters and **0.1.0** sidecar first publish. |
| `latest` | Stable default install tag; requires typing **`YES`** in `confirm_latest`.                           |
| `next`   | Pre-release channel                                                                                  |
| `beta`   | Beta channel                                                                                         |
| `alpha`  | Alpha channel                                                                                        |

Preflight runs **`npm publish --dry-run`** without **`--tag`** — no dist-tag changes during preflight. Real upload applies **`--tag`** only in the approved **publish** job.

Consumers pinning contracts:

```bash
npm install @osva-ai/adapter-artifact-azure@0.1.2 @osva-ai/contracts@1.1.4
```

## Safe preflight and publication procedure (per package)

### 1. Preflight (default — no registry upload)

1. Merge release-prep PR to **`main`** with the target version in that package’s `package.json`.
2. Confirm **package-ready** status (CI + commands above).
3. GitHub → **Actions → Publish npm package → Run workflow**:
   - Branch: **`main`** (or tag **`v{expected_version}`** after tagging that commit).
   - **package:** one package only.
   - **expected_version:** must match `package.json` (**0.1.2** adapters, **0.1.0** sidecar).
   - **dist_tag:** `rc` (used only if you later publish).
   - **confirm_latest:** empty unless planning `latest`.
   - **confirm_real_publish:** leave **empty** (default preflight).
4. Workflow runs **plan → preflight** only: input validation, ref gate, frozen install, pack/inspect, sidecar security gate when applicable, registry 404 check, **`npm publish --dry-run`**, upload verified tarball artifact.
5. Record **preflight-passed** for that package/version.

### 2. Real publication (explicit maintainer approval)

1. Re-run the **same** workflow on the **same commit** (or tag) with identical inputs except:
   - **confirm_real_publish:** **`PUBLISH`**
2. Approve the **`npm-publish`** environment deployment when prompted.
3. **publish** job downloads the preflight tarball artifact and runs **`npm publish`** (OIDC or `NPM_TOKEN`).
4. Post-step verifies `npm view <package>@<version>`.
5. Record **published**; repeat preflight/publish independently for other packages.

### Post-publication smoke (required)

In a clean directory (not the monorepo):

```bash
npm install @osva-ai/adapter-artifact-azure@0.1.2 @osva-ai/contracts@1.1.4
# or sidecar:
npm install @osva-ai/runtime-cli-sidecar@0.1.0 @osva-ai/contracts@1.1.4
npx osva-runtime-cli-sidecar --help   # sidecar only
npm view @osva-ai/<package> dist-tags --json
```

## Workflow security summary

- Trigger: **`workflow_dispatch` only**.
- Default: **preflight-only** (`confirm_real_publish` empty).
- Real upload: requires **`confirm_real_publish=PUBLISH`** plus **`npm-publish`** environment approval.
- Input validation: **`validate-publish-inputs.mjs`** (allowlisted package names, semver, dist-tags; no shell injection).
- Ref: **`main`** or semver tag **`v*.*.*`**; tag must equal **`v{expected_version}`**.
- Checkout: pinned to **`github.sha`** with clean tree check on preflight.
- Build / pack / inspect: **selected package only** (`prepublish-package.mjs`).
- Registry: abort if version already exists (immutable).
- Credentials: **publish** job only; preflight has no `registry-url` / `NPM_TOKEN`.

Regression test: `pnpm test:publish-workflow-safety` (also runs in CI).

## Rollback limitations

- **Unpublish** is time-limited on npm and discouraged for public adapters.
- Prefer **`npm deprecate @osva-ai/adapter-artifact-azure@0.1.0 "reason"`** and ship **`0.1.2`**.
- Consumers must **pin** versions in deployment images; dist-tags alone are not enough for production.

## Failure recovery and partial publication

| Situation                         | Recovery                                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| CI failed before merge            | Fix and re-run CI; do not publish.                                          |
| Preflight failed                  | Fix tarball/gates; re-run with empty `confirm_real_publish`.                |
| Publish failed before npm upload  | Fix auth/config; re-run preflight then publish (version still unpublished). |
| One adapter published, second not | Publish the remaining package in a **separate** workflow run.               |
| Wrong dist-tag                    | `npm dist-tag add <pkg>@<version> rc` (maintainer token); document change.  |
| Bad tarball after publish         | Deprecate version; publish patch; update consumer pins.                     |

Evidence files under `scripts/acceptance/*/evidence/` are gitignored and must not contain secrets.

## Security boundaries

- No committed secrets; runtime Azure credentials via operator env only.
- No runtime adapter discovery.
- Do not recommend memory adapter for multiprocess production.
- Azurite / A1.4 does not prove real Azure production readiness.
