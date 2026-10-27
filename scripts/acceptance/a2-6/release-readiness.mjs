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
const OFFICIAL_CONTRACTS_VERSION = "1.1.0-rc.4";
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
  const zodVersions = [...lockText.matchAll(/zod@(\d+\.\d+\.\d+)/g)].map(
    (m) => m[1],
  );
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
      ? "OSVA packages still resolve a vulnerable zod; upgrade requires compatible @osva-ai/* release."
      : "Resolved zod is outside known advisory range for GHSA-mrhx-c7xc-m3w5.",
  };
}

function spawnNpm(args, cwd) {
  return spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

/**
 * Production consumer graph: packed sidecar tarball + pinned @osva-ai/* from npm.
 * npm audit requires a lockfile (npm 10+ ENOLOCK without one after --no-save install).
 */
async function npmAuditOnConsumer() {
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "osva-a26-audit-"));
  /** @type {string | undefined} */
  let packDir;
  const auditScope = {
    packedSidecar: PACKAGE_NAME,
    npmDependencies: [
      `@osva-ai/contracts@${OFFICIAL_CONTRACTS_VERSION}`,
      `@osva-ai/sdk@${OFFICIAL_CONTRACTS_VERSION}`,
      `@osva-ai/runtime-protocol@${OFFICIAL_CONTRACTS_VERSION}`,
    ],
    omitDev: true,
    note: "Temp consumer; sidecar from local pnpm pack, OSVA packages from registry",
  };
  try {
    run("pnpm", ["--filter", PACKAGE_NAME, "build"]);
    const packed = await packAdapter(PACKAGE_DIR);
    packDir = packed.packDir;
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
    const lock = spawnNpm(["i", "--package-lock-only"], workRoot);
    if (lock.status !== 0) {
      return {
        status: "INDETERMINATE",
        auditScope,
        exitCode: lock.status,
        publicationBlocked: true,
        reason: "npm i --package-lock-only failed before audit",
        stderr: (lock.stderr ?? "").trim().slice(0, 800) || undefined,
      };
    }
    const audit = spawnNpm(["audit", "--json", "--omit=dev"], workRoot);
    let parsed;
    try {
      parsed = JSON.parse(audit.stdout?.trim() || "{}");
    } catch {
      return {
        status: "INDETERMINATE",
        auditScope,
        exitCode: audit.status,
        publicationBlocked: true,
        reason: "npm audit --json output was not valid JSON",
        stdoutHead: (audit.stdout ?? "").trim().slice(0, 400) || undefined,
        stderr: (audit.stderr ?? "").trim().slice(0, 800) || undefined,
      };
    }
    if (parsed.error) {
      return {
        status: "INDETERMINATE",
        auditScope,
        exitCode: audit.status,
        publicationBlocked: true,
        reason: "npm audit reported an execution error",
        auditError: parsed.error,
        stderr: (audit.stderr ?? "").trim().slice(0, 800) || undefined,
      };
    }
    const vulnerabilities = parsed.metadata?.vulnerabilities ?? null;
    const high = vulnerabilities?.high ?? 0;
    const critical = vulnerabilities?.critical ?? 0;
    if (high > 0 || critical > 0) {
      return {
        status: "BLOCKED",
        auditScope,
        exitCode: audit.status,
        vulnerabilities,
        publicationBlocked: true,
        reason:
          "high or critical vulnerabilities in production dependency graph",
      };
    }
    if (audit.status !== 0) {
      return {
        status: "INDETERMINATE",
        auditScope,
        exitCode: audit.status,
        vulnerabilities,
        publicationBlocked: true,
        reason:
          "npm audit exited non-zero without confirmed high/critical counts",
        stderr: (audit.stderr ?? "").trim().slice(0, 800) || undefined,
      };
    }
    return {
      status: "PASS",
      auditScope,
      exitCode: 0,
      vulnerabilities,
      publicationBlocked: false,
    };
  } finally {
    if (packDir) {
      await rm(packDir, { force: true, recursive: true });
    }
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
      npmPublication: "READY",
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

  const evidenceDir = path.join(
    REPO_ROOT,
    "scripts",
    "acceptance",
    "a2-6",
    "evidence",
  );
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
