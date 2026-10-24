#!/usr/bin/env node
import { verifySinglePackageForPublish } from "./lib/publish-single-package.mjs";

const packageName = process.argv[2];
const expectedVersion = process.argv[3];

if (!packageName || !expectedVersion) {
  console.error(
    "Usage: node prepublish-package.mjs <@scope/name> <expected-version>",
  );
  process.exit(1);
}

const result = await verifySinglePackageForPublish(
  packageName,
  expectedVersion,
);
console.log(
  JSON.stringify({
    package: packageName,
    version: expectedVersion,
    status: "pass",
    findings: result.inspectFindings,
  }),
);
