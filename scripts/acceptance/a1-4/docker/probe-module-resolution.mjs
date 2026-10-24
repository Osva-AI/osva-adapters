#!/usr/bin/env node
/**
 * Resolves the operator module the same way OSVA registered-loader does
 * (bare package specifier → workspace root node_modules).
 */
const specifier =
  process.env.OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE ??
  "@osva-ai/adapter-artifact-azure";

let imported;
try {
  imported = await import(specifier);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IMPORT_FAIL ${specifier}: ${message}`);
  process.exit(1);
}

if (typeof imported.createArtifactBlobStore !== "function") {
  console.error(
    `MISSING_FACTORY ${specifier}: createArtifactBlobStore is not a function`,
  );
  process.exit(1);
}

console.log(`RESOLVED ${specifier} cwd=${process.cwd()}`);
