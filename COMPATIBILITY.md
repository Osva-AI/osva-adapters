# Compatibility

## Tested against

| Component             | Version                 | Notes                                                                                                       |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@osva-ai/contracts`  | `1.1.0-rc.2` (declared) | Artifact blob port types match [OSVA main](https://github.com/Osva-AI/osva) `packages/contracts` at M12.4.3 |
| OSVA core (reference) | `1.1.0-rc.2`            | [Osva-AI/osva](https://github.com/Osva-AI/osva) milestone M12.4.3 / M12.4.4 acceptance                      |
| Node.js               | `>=24`                  | Matches contracts `engines`                                                                                 |

## npm publication gap (A1.1)

The public npm tarball `@osva-ai/contracts@1.1.0-rc.2` **does not yet include** compiled `artifact-blob-store` / `artifact-storage-config` exports (source exists on OSVA main; see M12.4.3 acceptance: public npm publication marked not done).

This repository applies a **pnpm patch** (`patches/@osva-ai__contracts@1.1.0-rc.2.patch`) so local development and pack-consumer tests typecheck against the M12.4.3 port surface. Remove the patch after a contracts release that includes those exports.

## Adapter semver

`@osva-ai/adapter-artifact-memory` `0.1.x` tracks the reference A1.1 slice. `@osva-ai/adapter-artifact-azure` `0.1.x` tracks the A1.2 slice. Breaking contract changes require a major bump on `@osva-ai/contracts` and a corresponding adapter release.

## A1.2 Azure dependencies

| Package               | Version (catalog) | Notes                            |
| --------------------- | ----------------- | -------------------------------- |
| `@azure/storage-blob` | `12.28.0`         | Official Azure Blob SDK for Node |
