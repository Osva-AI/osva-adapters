#!/usr/bin/env node
/**
 * Capture Compose failure diagnostics (sanitized; no full container env dumps).
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { runCapture } from "../a1-4/lib/shell.mjs";

const SECRET_PATTERNS = [
  [/AccountKey=[^;\s"']+/gi, "AccountKey=[REDACTED]"],
  [
    /DefaultEndpointsProtocol=[^;\s"']+/gi,
    "DefaultEndpointsProtocol=[REDACTED]",
  ],
  [/BlobEndpoint=[^;\s"']+/gi, "BlobEndpoint=[REDACTED]"],
  [/(POSTGRES_PASSWORD=)[^\s"']+/gi, "$1[REDACTED]"],
  [/(OSVA_[A-Z0-9_]*SECRET=)[^\s"']+/gi, "$1[REDACTED]"],
  [/(OSVA_AUTH_SECRET=)[^\s"']+/gi, "$1[REDACTED]"],
  [/(OSVA_SIDECAR_AUTH_SECRET=)[^\s"']+/gi, "$1[REDACTED]"],
  [/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]"],
  [/osva_ak_[a-zA-Z0-9_]+/g, "osva_ak_[REDACTED]"],
];

/**
 * @param {string} text
 * @returns {string}
 */
export function redactDiagnosticText(text) {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * @param {{
 *   composeFile: string;
 *   envFile: string;
 *   cwd: string;
 *   slice: string;
 *   logServices?: string[];
 *   logTail?: number;
 *   evidenceDir?: string;
 *   phase?: string;
 *   error?: unknown;
 * }} options
 */
export async function captureComposeFailureDiagnostics(options) {
  const composeArgs = [
    "compose",
    "-f",
    options.composeFile,
    "--env-file",
    options.envFile,
  ];
  const logServices = options.logServices ?? [
    "worker",
    "web",
    "cli-sidecar",
    "scheduler",
    "workflow-orchestrator",
    "knowledge-worker",
    "migrate",
    "azurite-init",
  ];
  const tail = options.logTail ?? 200;

  const report = {
    slice: options.slice,
    phase: options.phase ?? "unknown",
    capturedAt: new Date().toISOString(),
    error:
      options.error instanceof Error
        ? options.error.message
        : options.error !== undefined
          ? String(options.error)
          : undefined,
    composePs: "",
    serviceLogs: {},
    workerContainer: null,
  };

  try {
    const { stdout } = runCapture("docker", [...composeArgs, "ps", "-a"], {
      cwd: options.cwd,
    });
    report.composePs = redactDiagnosticText(stdout);
  } catch (captureError) {
    report.composePs = `[docker compose ps failed: ${String(captureError)}]`;
  }

  for (const service of logServices) {
    try {
      const { stdout, stderr } = runCapture(
        "docker",
        [...composeArgs, "logs", "--no-color", "--tail", String(tail), service],
        { cwd: options.cwd },
      );
      report.serviceLogs[service] = redactDiagnosticText(
        `${stdout}\n${stderr}`.trim(),
      );
    } catch (captureError) {
      report.serviceLogs[service] =
        `[log capture failed: ${String(captureError)}]`;
    }
  }

  try {
    const { stdout: ids } = runCapture(
      "docker",
      [...composeArgs, "ps", "-q", "worker"],
      { cwd: options.cwd },
    );
    const containerId = ids.trim().split(/\s+/).filter(Boolean)[0];
    if (containerId) {
      const { stdout: stateJson } = runCapture(
        "docker",
        ["inspect", containerId, "--format", "{{json .State}}"],
        { cwd: options.cwd },
      );
      const { stdout: healthJson } = runCapture(
        "docker",
        ["inspect", containerId, "--format", "{{json .State.Health}}"],
        { cwd: options.cwd },
      );
      const state = JSON.parse(stateJson.trim());
      report.workerContainer = {
        id: containerId.slice(0, 12),
        status: state.Status,
        exitCode: state.ExitCode,
        oomKilled: state.OOMKilled,
        restartCount: state.RestartCount,
        health: healthJson.trim() ? JSON.parse(healthJson.trim()) : null,
      };
    }
  } catch (captureError) {
    report.workerContainer = {
      error: String(captureError),
    };
  }

  if (options.evidenceDir) {
    await mkdir(options.evidenceDir, { recursive: true });
    const outPath = path.join(
      options.evidenceDir,
      "docker-failure-diagnostics.json",
    );
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    report.writtenTo = outPath;
  }

  console.error(
    `[diagnostics] Compose failure capture (${options.slice}, phase=${report.phase})`,
  );
  if (report.workerContainer && "status" in report.workerContainer) {
    console.error(
      `[diagnostics] worker status=${report.workerContainer.status} exitCode=${String(report.workerContainer.exitCode)} restartCount=${String(report.workerContainer.restartCount)}`,
    );
  }

  return report;
}
