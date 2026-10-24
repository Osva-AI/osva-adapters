#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FORBIDDEN_TAR_PATH = /(^|\/)(test|src|coverage|\.vitest)(\/|$)/;
const FORBIDDEN_FILE = /\.(env|pem|key)$/i;

/**
 * @param {string} tgzPath
 * @returns {Promise<{ manifest: Record<string, unknown>; paths: string[] }>}
 */
export async function readPackedTarball(tgzPath) {
  const extractDir = await mkdtemp(
    path.join(os.tmpdir(), "osva-pack-inspect-"),
  );
  try {
    const result = spawnSync("tar", ["-tzf", tgzPath], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(`tar -tzf failed for ${tgzPath}`);
    }
    const paths = (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    spawnSync("tar", ["-xzf", tgzPath, "-C", extractDir], { stdio: "inherit" });
    const manifestRaw = await readFile(
      path.join(extractDir, "package", "package.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw);
    return { manifest, paths };
  } finally {
    await rm(extractDir, { force: true, recursive: true });
  }
}

/**
 * @param {string} packageName
 * @param {string} tgzPath
 * @returns {Promise<{ ok: true; findings: string[] } | { ok: false; errors: string[] }>}
 */
export async function inspectAdapterTarball(packageName, tgzPath) {
  const errors = [];
  const findings = [];
  const { manifest, paths } = await readPackedTarball(tgzPath);

  if (manifest.name !== packageName) {
    errors.push(`manifest.name ${String(manifest.name)} !== ${packageName}`);
  }

  for (const entry of paths) {
    const normalized = entry.replace(/^package\//, "");
    if (FORBIDDEN_TAR_PATH.test(normalized)) {
      errors.push(`Forbidden path in tarball: ${entry}`);
    }
    if (FORBIDDEN_FILE.test(normalized)) {
      errors.push(`Sensitive-looking file in tarball: ${entry}`);
    }
  }

  const required = [
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/README.md",
  ];
  for (const req of required) {
    if (!paths.includes(req)) {
      errors.push(`Missing required tarball entry: ${req}`);
    }
  }

  const deps = { ...manifest.dependencies, ...manifest.optionalDependencies };
  for (const [name, spec] of Object.entries(deps ?? {})) {
    if (typeof spec !== "string") {
      errors.push(`Non-string dependency spec for ${name}`);
      continue;
    }
    if (spec.includes("catalog:") || spec.includes("workspace:")) {
      errors.push(`Unresolved dependency specifier ${name}@${spec}`);
    }
  }

  if (packageName === "@osva-ai/adapter-artifact-azure") {
    if (deps["@azure/storage-blob"] !== "12.28.0") {
      errors.push(
        `Expected @azure/storage-blob 12.28.0 in packed manifest, got ${String(deps["@azure/storage-blob"])}`,
      );
    }
  }

  if (deps["@osva-ai/contracts"] !== "1.1.0-rc.3") {
    errors.push(
      `Expected @osva-ai/contracts 1.1.0-rc.3 in packed manifest, got ${String(deps["@osva-ai/contracts"])}`,
    );
  }

  findings.push(`version=${String(manifest.version)}`);
  findings.push(`tarballEntries=${String(paths.length)}`);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, findings };
}
