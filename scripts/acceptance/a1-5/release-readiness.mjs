#!/usr/bin/env node
/**
 * A1.5 prepublication verification (local or CI).
 * Does not publish, tag, or rebuild OSVA core deployment images.
 */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectAdapterTarball } from "./lib/pack-inspect.mjs";
import { packAdapter, verifyRegistrationExport } from "./lib/pack-pipeline.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PACKAGES = [
  {
    name: "@osva-ai/adapter-artifact-memory",
    dir: path.join(REPO_ROOT, "packages", "artifact-memory"),
    packConsumerScript: path.join(
      REPO_ROOT,
      "scripts",
      "acceptance",
      "a1-1-pack-consumer.mjs",
    ),
  },
  {
    name: "@osva-ai/adapter-artifact-azure",
    dir: path.join(REPO_ROOT, "packages", "artifact-azure"),
    packConsumerScript: path.join(
      REPO_ROOT,
      "scripts",
      "acceptance",
      "a1-2-pack-consumer.mjs",
    ),
  },
];

const OFFICIAL_CONTRACTS_VERSION = "1.1.0-rc.3";

function run(command, args, options = {}) {
  const useShell =
    process.platform === "win32" &&
    (command === "pnpm" ||
      command === "npm" ||
      command === "npx" ||
      command === "docker");
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? "inherit",
    shell: useShell,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (exit ${String(result.status)})`,
    );
  }
}

function parseArgs(argv) {
  return {
    skipAzureDocker: argv.includes("--skip-azure-docker"),
    writeEvidence: !argv.includes("--no-evidence"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const report = {
    slice: "A1.5",
    startedAt,
    contractsVersion: OFFICIAL_CONTRACTS_VERSION,
    packages: [],
    npmAvailability: {
      "@osva-ai/adapter-artifact-memory": "not published (404 at audit)",
      "@osva-ai/adapter-artifact-azure": "not published (404 at audit)",
    },
    recommendation: "READY",
  };

  const packDirs = [];

  try {
    for (const pkg of PACKAGES) {
      const entry = {
        name: pkg.name,
        version: null,
        packInspect: null,
        externalConsumer: "skipped",
        registrationExport: "skipped",
      };

      run("pnpm", ["--filter", pkg.name, "build"]);

      const workspaceManifest = JSON.parse(
        await readFile(path.join(pkg.dir, "package.json"), "utf8"),
      );
      entry.version = workspaceManifest.version;

      const packed = await packAdapter(pkg.dir);
      packDirs.push(packed.packDir);

      entry.packInspect = await inspectAdapterTarball(pkg.name, packed.tgz);
      if (!entry.packInspect.ok) {
        report.recommendation = "BLOCKED";
      }

      await verifyRegistrationExport(pkg.name, packed.tgz);
      entry.registrationExport = "pass";

      if (
        pkg.name === "@osva-ai/adapter-artifact-azure" &&
        args.skipAzureDocker
      ) {
        entry.externalConsumer =
          "skipped (--skip-azure-docker; run scripts/acceptance/a1-2-pack-consumer.mjs locally)";
      } else {
        run(process.execPath, [pkg.packConsumerScript]);
        entry.externalConsumer = "pass";
      }

      report.packages.push(entry);
    }

    report.finishedAt = new Date().toISOString();
    report.a1_4DeploymentAcceptance =
      "Independent gate: scripts/acceptance/a1-4/run.mjs (not rerun in this script)";

    const blocked = report.packages.some(
      (p) => p.packInspect && !p.packInspect.ok,
    );
    if (blocked) {
      report.recommendation = "BLOCKED";
    }

    const sanitized = JSON.stringify(report, null, 2);
    process.stdout.write(`${sanitized}\n`);

    if (args.writeEvidence) {
      const evidenceDir = path.join(
        REPO_ROOT,
        "scripts",
        "acceptance",
        "a1-5",
        "evidence",
      );
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, "latest.json"), `${sanitized}\n`);
    }

    if (report.recommendation === "BLOCKED") {
      process.exitCode = 1;
    }
  } finally {
    for (const dir of packDirs) {
      await rm(dir, { force: true, recursive: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
