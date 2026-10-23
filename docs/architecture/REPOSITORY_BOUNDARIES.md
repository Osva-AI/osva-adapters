# Repository boundaries

## osva-adapters (this repo)

- External **infrastructure** adapters (artifact blob stores, future job queues, telemetry exporters, etc.).
- Published as independent npm packages under `@osva-ai/adapter-*`.
- Depends only on public `@osva-ai/contracts` (plus minimal dev tooling).

## osva (core)

- Metadata authority, APIs, orchestration, built-in filesystem/S3 artifact drivers, registration loader (`@osva/adapters-artifact-storage` in core).
- Defines and semver-publishes contracts.

## osva-connectors

- External API and MCP **tool** integrations—not duplicated here.

## osva-examples

- Reference workflows and demos—not duplicated here.

## Registration model

Operators install adapter packages into deployment images and set trusted environment configuration (`OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE`, etc.). OSVA does not download or discover adapters automatically.
