#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const EVIDENCE_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "acceptance",
  "a2-5",
  "evidence",
  "latest.json",
);

const REQUIRED_SCENARIO_PREFIXES = [
  "Compose stack healthy",
  "Worker E2E (",
  "Worker failure propagation (",
  "Transport:",
  "Identity:",
  "CLI security:",
  "Capability token not in",
  "Sidecar restart recovery",
  "Cleanup compose stack",
];

/**
 * @param {object} options
 * @param {string} options.runStartedAt ISO timestamp — evidence must be newer
 * @param {string} [options.gitRef] expected HEAD when provided
 */
export async function verifyA25Evidence(options) {
  const errors = [];
  let raw;
  try {
    raw = await readFile(EVIDENCE_PATH, "utf8");
  } catch {
    return {
      ok: false,
      errors: ["Missing A2.5 evidence file (scripts/acceptance/a2-5/evidence/latest.json)"],
    };
  }

  let evidence;
  try {
    evidence = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["A2.5 evidence is not valid JSON"] };
  }

  const finishedAt = evidence.finishedAt;
  if (typeof finishedAt !== "string") {
    errors.push("Evidence missing finishedAt");
  } else if (Date.parse(finishedAt) < Date.parse(options.runStartedAt)) {
    errors.push(
      "Evidence finishedAt is older than this release-readiness run (stale cache)",
    );
  }

  if (options.gitRef && evidence.gitRef && evidence.gitRef !== options.gitRef) {
    errors.push(
      `Evidence gitRef ${evidence.gitRef} does not match current HEAD ${options.gitRef}`,
    );
  }

  const scenarios = Array.isArray(evidence.scenarios) ? evidence.scenarios : [];
  const nonPass = scenarios.filter((s) => s.status !== "pass");
  if (nonPass.length > 0) {
    for (const s of nonPass) {
      errors.push(`Scenario ${s.status.toUpperCase()}: ${s.name}`);
    }
  }

  for (const prefix of REQUIRED_SCENARIO_PREFIXES) {
    const found = scenarios.some(
      (s) => s.status === "pass" && s.name.startsWith(prefix),
    );
    if (!found) {
      errors.push(`Missing required PASS scenario matching: ${prefix}*`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, evidenceSummary: { finishedAt, scenarioCount: scenarios.length } };
  }

  return {
    ok: true,
    evidenceSummary: {
      finishedAt,
      scenarioCount: scenarios.length,
      sidecarVersion: evidence.sidecarVersion,
    },
  };
}
