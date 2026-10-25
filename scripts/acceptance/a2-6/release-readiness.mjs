#!/usr/bin/env node
/**
 * A2.6 prepublication verification for @osva-ai/runtime-cli-sidecar.
 * Does not publish to npm or push OCI images.
 */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACK_CONSUMER_DEADLINE_MS,
  runWithDeadline,
} from "../lib/run-with-deadline.mjs";
import { inspectAdapterTarball } from "../a1-5/lib/pack-inspect.mjs";
import { packAdapter } from "../a1-5/lib/pack-pipeline.mjs";
import { verifySinglePackageForPublish } from "../a1-5/lib/publish-single-package.mjs";
import { verifyA25Evidence } from "./lib/a25-evidence-verify.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PACKAGE_NAME = "@osva-ai/runtime-cli-sidecar";
const PACKAGE_DIR = path.join(REPO_ROOT, "packages", "runtime-cli-sidecar");
const OFFICIAL_CONTRACTS_VERSION = "1.1.0-rc.3";
const ZOD_GHSA = "GHSA-mrhx-c7xc-m3w5";
const KNOWN_VULNERABLE_ZOD = new Set(["4.6.5"]);

function parseArgs(argv) {
  return {
    requireA25: argv.includes("--require-a25"),
    publicationGateOnly: argv.includes("--publication-gate-only"),
  };
}

function run(command, args, options = {}) {
  const useShell =
    process.platform === "win32" &&
    (command === "pnpm" || command === "npm" || command === "npx");
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
  return result;
}

async function auditZodDependency() {
  const lockText = await readFile(
    path.join(REPO_ROOT, "pnpm-lock.yaml"),
    "utf8",
  );
  const zodVersions = [
    ...lockText.matchAll(/zod@(\d+\.\d+\.\d+)/g),
  ].map((m) => m[1]);
  const resolved = zodVersions[0] ?? "unknown";
  const vulnerable = zodVersions.some((v) => KNOWN_VULNERABLE_ZOD.has(v));
  return {
    ghsa: ZOD_GHSA,
    resolvedZod: resolved,
    patchedAvailable: "4.6.6+",
    dependencyPath:
      "@osva-ai/contracts / @osva-ai/sdk / @osva-ai/runtime-protocol → zod",
    productionPublicationBlocked: vulnerable,
    note: vulnerable
      ? "RC3 OSVA packages pin zod@4.6.5; upgrade requires compatible @osva-ai/* release."
      : "Resolved zod is outside known advisory range for GHSA-mrhx-c7xc-m3w5.",
  };
}

async function npmAuditOnConsumer() {
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "osva-a26-audit-"));
  try {
    run("pnpm", ["--filter", PACKAGE_NAME, "build"]);
    const packed = await packAdapter(PACKAGE_DIR);
    await writeFile(
      path.join(workRoot, "package.json"),
      JSON.stringify({ name: "audit-consumer", private: true }),
    );
    run(
      "npm",
      [
        "install",
        "--no-save",
        packed.tgz,
        `@osva-ai/contracts@${OFFICIAL_CONTRACTS_VERSION}`,
        `@osva-ai/sdk@${OFFICIAL_CONTRACTS_VERSION}`,
        `@osva-ai/runtime-protocol@${OFFICIAL_CONTRACTS_VERSION}`,
      ],
      { cwd: workRoot },
    );
    const audit = spawnSync("npm", ["audit", "--json"], {
      cwd: workRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    let summary = { exitCode: audit.status, vulnerabilities: null };
    try {
      summary.vulnerabilities = JSON.parse(audit.stdout ?? "{}").metadata
        ?.vulnerabilities;
    } catch {
      summary.parseError = true;
    }
    summary.publicationBlocked =
      audit.status !== 0 ||
      summary.parseError === true ||
      (summary.vulnerabilities?.high ?? 0) > 0 ||
      (summary.vulnerabilities?.critical ?? 0) > 0;
    await rm(packed.packDir, { force: true, recursive: true });
    return summary;
  } finally {
    await rm(workRoot, { force: true, recursive: true });
  }
}

async function readGitHead() {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return result.status === 0 ? result.stdout.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const gitRef = await readGitHead();
  const manifest = JSON.parse(
    await readFile(path.join(PACKAGE_DIR, "package.json"), "utf8"),
  );

  const report = {
    slice: "A2.6",
    startedAt,
    package: PACKAGE_NAME,
    version: manifest.version,
    contractsVersion: OFFICIAL_CONTRACTS_VERSION,
    npmPublicationState: "not executed (manual release)",
    recommendation: {
      implementationPr: "READY",
      npmPublication: "BLOCKED",
    },
    gates: {},
  };

  if (cli.requireA25) {
    run(process.execPath, [
      path.join(REPO_ROOT, "scripts", "acceptance", "a2-5", "run.mjs"),
    ]);
    const a25Check = await verifyA25Evidence({
      runStartedAt: startedAt,
      ...(gitRef !== undefined ? { gitRef } : {}),
    });
    report.gates.a25Deployment = a25Check;
    if (!a25Check.ok) {
      report.recommendation.implementationPr = "BLOCKED";
      report.recommendation.npmPublication = "BLOCKED";
    } else {
      report.gates.a25Deployment = { ok: true, ...a25Check.evidenceSummary };
    }
  } else {
    report.gates.a25Deployment = {
      ok: false,
      skipped: true,
      note: "Pass --require-a25 for release gate (CI uses this flag)",
    };
  }

  if (!cli.publicationGateOnly) {
    run("pnpm", ["--filter", PACKAGE_NAME, "lint"]);
    run("pnpm", ["--filter", PACKAGE_NAME, "typecheck"]);
    run("pnpm", ["--filter", PACKAGE_NAME, "test"]);
    report.gates.unitTests = "pass";
  }

  const publishCheck = await verifySinglePackageForPublish(
    PACKAGE_NAME,
    manifest.version,
  );
  report.gates.packInspect = "pass";
  report.gates.publishSinglePackage = publishCheck.inspectFindings;

  const packed = await packAdapter(PACKAGE_DIR);
  const inspect = await inspectAdapterTarball(PACKAGE_NAME, packed.tgz);
  if (!inspect.ok) {
    report.recommendation.implementationPr = "BLOCKED";
    report.recommendation.npmPublication = "BLOCKED";
  }
  report.gates.tarballInspect = inspect;

  await runWithDeadline(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "acceptance", "a2-2-4-pack-consumer.mjs")],
    {
      cwd: REPO_ROOT,
      timeoutMs: PACK_CONSUMER_DEADLINE_MS,
      label: "a2-2-4-pack-consumer",
      shell: false,
    },
  );
  report.gates.externalConsumer = "pass";

  report.gates.zodAdvisory = await auditZodDependency();
  if (report.gates.zodAdvisory.productionPublicationBlocked) {
    report.recommendation.npmPublication = "BLOCKED";
  }

  report.gates.npmAudit = await npmAuditOnConsumer();
  if (report.gates.npmAudit.publicationBlocked) {
    report.recommendation.npmPublication = "BLOCKED";
  }

  report.finishedAt = new Date().toISOString();

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(serialized);

  const evidenceDir = path.join(REPO_ROOT, "scripts", "acceptance", "a2-6", "evidence");
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, "latest.json"), serialized);

  await rm(packed.packDir, { force: true, recursive: true });

  const blocked =
    report.recommendation.implementationPr === "BLOCKED" ||
    (cli.requireA25 && report.gates.a25Deployment?.ok !== true);
  if (blocked) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
