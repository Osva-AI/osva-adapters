# Compatibility

## Tested against

| Component             | Version                 | Notes                                                                                   |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `@osva-ai/contracts`  | `1.1.0-rc.3` (declared) | Official npm `rc` dist-tag; includes M12.4.3 artifact blob store and registration types |
| OSVA core (reference) | `1.1.0-rc.3`            | [Osva-AI/osva](https://github.com/Osva-AI/osva) RC3 line (commit `744c1bb` and later)   |
| Node.js               | `>=24`                  | Matches contracts `engines`                                                             |

## npm consumption (A1.3)

Adapters depend on the **unmodified** registry package `@osva-ai/contracts@1.1.0-rc.3`. No pnpm patches or vendored contract copies are used in this repository.

Install with the `rc` dist-tag when pinning explicitly:

```bash
npm install @osva-ai/contracts@rc
```

## Adapter semver

`@osva-ai/adapter-artifact-memory` `0.1.x` tracks the reference A1.1 slice. `@osva-ai/adapter-artifact-azure` `0.1.x` tracks the A1.2 slice. Breaking contract changes require a major bump on `@osva-ai/contracts` and a corresponding adapter release.

## A1.2 Azure dependencies

| Package               | Version (catalog) | Notes                            |
| --------------------- | ----------------- | -------------------------------- |
| `@azure/storage-blob` | `12.28.0`         | Official Azure Blob SDK for Node |
