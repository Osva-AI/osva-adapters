#!/usr/bin/env node
/**
 * A2.5 — OSVA worker + CLI sidecar deployment acceptance.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { captureComposeFailureDiagnostics } from "../lib/compose-failure-diagnostics.mjs";
import { pollUntil } from "../a1-4/lib/poll.mjs";
import { run, runCapture } from "../a1-4/lib/shell.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOCKER_DIR = path.join(SCRIPT_DIR, "docker");
const ADAPTER_DIR = path.join(REPO_ROOT, "packages", "artifact-azure");
const SIDECAR_DIR = path.join(REPO_ROOT, "packages", "runtime-cli-sidecar");
const COMPOSE_FILE = path.join(DOCKER_DIR, "compose.yml");
const ENV_FILE = path.join(DOCKER_DIR, ".env");
const ENV_EXAMPLE = path.join(DOCKER_DIR, ".env.example");

const OSVA_RC_TAG = "v1.1.0-rc.4";
const OSVA_RC_COMMIT = "cd38eea46b8ee44bb099ccf307818cfcd348f50b";
const KEEP_COMPOSE_ON_FAILURE =
  process.env.OSVA_A25_KEEP_COMPOSE_ON_FAILURE === "1";
const BASE_IMAGE = "osva:1.1.0-rc.4-a25-base";
const ADAPTER_IMAGE = "osva-a25-with-azure:local";
const SIDECAR_IMAGE = "osva-a25-cli-sidecar:local";

const CAPABILITY_TOKEN_PROBE = "a25-capability-token-probe-value";

const evidence = {
  slice: "A2.5",
  schemaVersion: 1,
  osvaTag: OSVA_RC_TAG,
  osvaCommit: OSVA_RC_COMMIT,
  sidecarPackage: "@osva-ai/runtime-cli-sidecar",
  sidecarVersion: "0.1.0",
  runtimeProtocolVersion: "1",
  startedAt: new Date().toISOString(),
  scenarios: [],
  deploymentProvenance: {},
};

function composeArgs(extra = []) {
  return ["compose", "-f", COMPOSE_FILE, "--env-file", ENV_FILE, ...extra];
}

function recordScenario(name, status, detail = {}) {
  evidence.scenarios.push({
    name,
    status,
    at: new Date().toISOString(),
    ...detail,
  });
  const label =
    status === "pass"
      ? "PASS"
      : status === "fail"
        ? "FAIL"
        : status === "blocked"
          ? "BLOCKED"
          : "SKIP";
  console.log(`[${label}] ${name}`);
}

async function ensureEnvFile() {
  try {
    await readFile(ENV_FILE, "utf8");
  } catch {
    await copyFile(ENV_EXAMPLE, ENV_FILE);
    console.log(`Created ${ENV_FILE} from example.`);
  }
}

async function resolveOsvaSource() {
  const configured =
    process.env.OSVA_RC4_SOURCE?.trim() || process.env.OSVA_RC3_SOURCE?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  const cloneRoot = await mkdtemp(path.join(os.tmpdir(), "osva-rc4-src-"));
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    OSVA_RC_TAG,
    "https://github.com/Osva-AI/osva.git",
    cloneRoot,
  ]);
  evidence.deploymentProvenance.osvaSource = cloneRoot;
  evidence.deploymentProvenance.osvaSourceMode = "ephemeral-clone";
  return cloneRoot;
}

async function packAdapter() {
  run("pnpm", ["--filter", "@osva-ai/adapter-artifact-azure", "build"], {
    cwd: REPO_ROOT,
  });
  const packDir = await mkdtemp(
    path.join(os.tmpdir(), "osva-a25-adapter-pack-"),
  );
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: ADAPTER_DIR });
  const { readdir } = await import("node:fs/promises");
  const tgzName = (await readdir(packDir)).find((name) =>
    name.endsWith(".tgz"),
  );
  if (!tgzName) {
    throw new Error("Adapter pack did not produce a tarball.");
  }
  const dest = path.join(DOCKER_DIR, "adapter-artifact-azure.tgz");
  await copyFile(path.join(packDir, tgzName), dest);
  await rm(packDir, { recursive: true, force: true });
  evidence.deploymentProvenance.adapterTarball = dest;
  return dest;
}

async function packSidecar() {
  run("pnpm", ["--filter", "@osva-ai/runtime-cli-sidecar", "build"], {
    cwd: REPO_ROOT,
  });
  const pkg = JSON.parse(
    await readFile(path.join(SIDECAR_DIR, "package.json"), "utf8"),
  );
  evidence.sidecarVersion = pkg.version;
  evidence.sidecarBuildId = createHash("sha256")
    .update(await readFile(path.join(SIDECAR_DIR, "package.json")))
    .digest("hex")
    .slice(0, 12);

  const packDir = await mkdtemp(
    path.join(os.tmpdir(), "osva-a25-sidecar-pack-"),
  );
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: SIDECAR_DIR });
  const { readdir } = await import("node:fs/promises");
  const tgzName = (await readdir(packDir)).find((name) =>
    name.endsWith(".tgz"),
  );
  if (!tgzName) {
    throw new Error("Sidecar pack did not produce a tarball.");
  }
  const dest = path.join(DOCKER_DIR, "runtime-cli-sidecar.tgz");
  await copyFile(path.join(packDir, tgzName), dest);
  await rm(packDir, { recursive: true, force: true });
  evidence.deploymentProvenance.sidecarTarball = dest;
  return dest;
}

function buildImages(osvaSource) {
  const ghcrRc = "ghcr.io/osva-ai/osva:1.1.0-rc.4";
  let baseFromRegistry = false;
  try {
    runCapture("docker", ["manifest", "inspect", ghcrRc]);
    baseFromRegistry = true;
  } catch {
    baseFromRegistry = false;
  }

  if (baseFromRegistry) {
    evidence.deploymentProvenance.baseImage = ghcrRc;
    evidence.deploymentProvenance.baseImageProvenance = "ghcr-published-rc4";
    run("docker", ["tag", ghcrRc, BASE_IMAGE]);
  } else {
    evidence.deploymentProvenance.baseImage = BASE_IMAGE;
    evidence.deploymentProvenance.baseImageProvenance =
      "local-docker-build-from-osva-rc4-tag";
    run("docker", [
      "build",
      "-t",
      BASE_IMAGE,
      "-f",
      path.join(osvaSource, "Dockerfile"),
      osvaSource,
    ]);
  }

  evidence.deploymentProvenance.adapterImage = ADAPTER_IMAGE;
  run("docker", [
    "build",
    "-t",
    ADAPTER_IMAGE,
    "-f",
    path.join(DOCKER_DIR, "Dockerfile.osva-with-azure-adapter"),
    "--build-arg",
    `OSVA_BASE_IMAGE=${BASE_IMAGE}`,
    DOCKER_DIR,
  ]);

  evidence.deploymentProvenance.sidecarImage = SIDECAR_IMAGE;
  run("docker", [
    "build",
    "-t",
    SIDECAR_IMAGE,
    "-f",
    path.join(DOCKER_DIR, "Dockerfile.runtime-cli-sidecar"),
    DOCKER_DIR,
  ]);
}

function composeDown() {
  run("docker", [...composeArgs(["down", "-v", "--remove-orphans"])], {
    cwd: DOCKER_DIR,
  });
}

function composeDownUnlessKept(acceptanceFailed) {
  if (acceptanceFailed && KEEP_COMPOSE_ON_FAILURE) {
    console.error(
      "OSVA_A25_KEEP_COMPOSE_ON_FAILURE=1 — leaving Compose stack up for inspection.",
    );
    return;
  }
  composeDown();
}

async function captureFailureDiagnostics(phase, error) {
  try {
    evidence.failureDiagnostics = await captureComposeFailureDiagnostics({
      composeFile: COMPOSE_FILE,
      envFile: ENV_FILE,
      cwd: DOCKER_DIR,
      slice: "A2.5",
      phase,
      error,
      evidenceDir: path.join(SCRIPT_DIR, "evidence"),
    });
  } catch (diagError) {
    evidence.failureDiagnostics = {
      phase,
      captureError: String(diagError),
    };
  }
}

function composeUp(extraEnv = {}) {
  run("docker", [...composeArgs(["up", "-d", "--wait"])], {
    cwd: DOCKER_DIR,
    env: extraEnv,
  });
}

function parseBootstrapOutput(text) {
  const workspaceMatch = text.match(/Workspace ID: (\S+)/);
  const tokenLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("osva_ak_"));
  if (!workspaceMatch || !tokenLine) {
    throw new Error("Failed to parse bootstrap output.");
  }
  return { workspaceId: workspaceMatch[1], apiKey: tokenLine };
}

async function bootstrapInstallation() {
  const { stdout } = runCapture(
    "docker",
    [...composeArgs(["--profile", "bootstrap", "run", "--rm", "bootstrap"])],
    { cwd: DOCKER_DIR },
  );
  return parseBootstrapOutput(stdout);
}

function apiHeaders(apiKey, workspaceId, extra = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    "x-osva-workspace-id": workspaceId,
    ...extra,
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

function scenarioPrompt(scenario) {
  return `__osva_scenario=${scenario}__ a25-deployment`;
}

function runInputForProvider(provider, scenario) {
  if (provider === "fixture") {
    return { scenario };
  }
  return { prompt: scenarioPrompt(scenario) };
}

async function recreateSidecarProvider(provider) {
  run(
    "docker",
    [...composeArgs(["up", "-d", "--force-recreate", "--wait", "cli-sidecar"])],
    {
      cwd: DOCKER_DIR,
      env: { OSVA_SIDECAR_CLI_PROVIDER: provider },
    },
  );
  await pollUntil(`sidecar ready (${provider})`, async () => {
    const port = await readSidecarHostPort();
    const res = await fetch(`http://127.0.0.1:${port}/health/ready`);
    return res.ok;
  });
}

async function readSidecarHostPort() {
  const envText = await readFile(ENV_FILE, "utf8");
  const match = envText.match(/^OSVA_A25_SIDECAR_PUBLISH_PORT=(\d+)/m);
  return match?.[1] ?? "19321";
}

async function readWebPort() {
  const envText = await readFile(ENV_FILE, "utf8");
  const match = envText.match(/^OSVA_PUBLISH_WEB_PORT=(\d+)/m);
  return match?.[1] ?? "18081";
}

async function createAgentVersion(baseUrl, session, endpoint, agentKey) {
  const { apiKey, workspaceId } = session;
  const agentRes = await fetchJson(`${baseUrl}/v1/agents`, {
    method: "POST",
    headers: {
      ...apiHeaders(apiKey, workspaceId),
      "content-type": "application/json",
    },
    body: JSON.stringify({ key: agentKey, name: `A25 ${agentKey}` }),
  });
  if (agentRes.status !== 201) {
    throw new Error(`Create agent failed: ${JSON.stringify(agentRes.body)}`);
  }
  const agentId = agentRes.body.id;
  const versionRes = await fetchJson(
    `${baseUrl}/v1/agents/${agentId}/versions`,
    {
      method: "POST",
      headers: {
        ...apiHeaders(apiKey, workspaceId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        manifest: {
          schemaVersion: "1",
          key: agentKey,
          name: `A25 ${agentKey}`,
          runtime: {
            type: "REMOTE_HTTP",
            protocolVersion: "1",
            endpoint,
          },
          input: { schema: {} },
          output: { schema: {} },
          execution: { timeoutMs: 60_000, maxAttempts: 1 },
          capabilities: { model: false, tools: [] },
        },
      }),
    },
  );
  if (versionRes.status !== 201) {
    throw new Error(
      `Create agent version failed: ${JSON.stringify(versionRes.body)}`,
    );
  }
  return { agentId, agentVersionId: versionRes.body.id };
}

async function executeRun(baseUrl, session, agentId, agentVersionId, input) {
  const { apiKey, workspaceId } = session;
  const runRes = await fetchJson(`${baseUrl}/v1/runs`, {
    method: "POST",
    headers: {
      ...apiHeaders(apiKey, workspaceId),
      "content-type": "application/json",
    },
    body: JSON.stringify({ agentId, agentVersionId, input }),
  });
  if (runRes.status !== 201) {
    throw new Error(`Create run failed: ${JSON.stringify(runRes.body)}`);
  }
  const runId = runRes.body.run.id;
  const runAttemptId = runRes.body.runAttempt.id;
  const started = Date.now();
  await pollUntil("worker run terminal", async () => {
    const statusRes = await fetchJson(`${baseUrl}/v1/runs/${runId}`, {
      headers: apiHeaders(apiKey, workspaceId),
    });
    const status = statusRes.body?.status;
    return status === "SUCCEEDED" || status === "FAILED" ? status : false;
  });
  const durationMs = Date.now() - started;
  const statusRes = await fetchJson(`${baseUrl}/v1/runs/${runId}`, {
    headers: apiHeaders(apiKey, workspaceId),
  });
  const attemptRes = await fetchJson(
    `${baseUrl}/v1/runs/${runId}/attempts/${runAttemptId}`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  return {
    runId,
    runAttemptId,
    durationMs,
    runStatus: statusRes.body?.status,
    attempt: attemptRes.body,
  };
}

async function workerProviderScenario(baseUrl, session, provider) {
  const endpoint = "http://cli-sidecar:9321/execute";
  const agentKey = `a25-${provider}-${Date.now()}`;
  const { agentId, agentVersionId } = await createAgentVersion(
    baseUrl,
    session,
    endpoint,
    agentKey,
  );
  const executionId = `a25-worker-${provider}-${randomUUID()}`;
  const result = await executeRun(baseUrl, session, agentId, agentVersionId, {
    ...runInputForProvider(provider, "success"),
    __executionProbe: executionId,
  });
  if (result.runStatus !== "SUCCEEDED") {
    throw new Error(
      `${provider} worker run failed: ${JSON.stringify(result.attempt)}`,
    );
  }
  recordScenario(`Worker E2E (${provider})`, "pass", {
    provider,
    executionId: result.runAttemptId,
    outcome: result.runStatus,
    durationMs: result.durationMs,
    verification: "RunAttempt persisted SUCCEEDED",
  });
  return result;
}

async function workerFailureScenario(baseUrl, session, provider) {
  const endpoint = "http://cli-sidecar:9321/execute";
  const agentKey = `a25-fail-${provider}-${Date.now()}`;
  const { agentId, agentVersionId } = await createAgentVersion(
    baseUrl,
    session,
    endpoint,
    agentKey,
  );
  const failScenario =
    provider === "fixture"
      ? "fail"
      : provider === "gemini"
        ? "fail-exit"
        : "fail-exit";
  const result = await executeRun(baseUrl, session, agentId, agentVersionId, {
    ...runInputForProvider(provider, failScenario),
  });
  if (result.runStatus !== "FAILED") {
    throw new Error(`Expected FAILED run for ${provider}`);
  }
  recordScenario(`Worker failure propagation (${provider})`, "pass", {
    provider,
    outcome: result.runStatus,
  });
}

async function postSidecarExecute(port, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function directHttpSecurityScenarios(port, provider = "gemini") {
  const baseBody = {
    protocolVersion: "1",
    executionId: `a25-sec-${randomUUID()}`,
    input: runInputForProvider(provider, "success"),
    capabilities: {
      endpoint: "http://127.0.0.1:1",
      token: CAPABILITY_TOKEN_PROBE,
    },
  };

  const missingAuth = await postSidecarExecute(port, baseBody);
  if (missingAuth.status !== 200 || missingAuth.json?.outcome !== "SUCCEEDED") {
    throw new Error("Baseline sidecar execute failed.");
  }
  recordScenario("Transport: valid execute (baseline)", "pass");

  const badVersion = await postSidecarExecute(port, {
    ...baseBody,
    executionId: `a25-sec-badver-${randomUUID()}`,
    protocolVersion: "99",
  });
  if (badVersion.status === 200 && badVersion.json?.outcome === "SUCCEEDED") {
    throw new Error("Invalid protocol version was accepted.");
  }
  recordScenario("Transport: invalid protocol version rejected", "pass");

  const malformed = await fetch(`http://127.0.0.1:${port}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  if (malformed.status < 400) {
    throw new Error("Malformed JSON should fail.");
  }
  recordScenario("Transport: malformed JSON rejected", "pass");

  const conflictA = await postSidecarExecute(port, {
    ...baseBody,
    executionId: "a25-conflict-id",
    input: runInputForProvider(provider, "success"),
  });
  const conflictB = await postSidecarExecute(port, {
    ...baseBody,
    executionId: "a25-conflict-id",
    input: runInputForProvider(
      provider,
      provider === "fixture" ? "fail" : "fail-exit",
    ),
  });
  if (
    conflictA.json?.outcome !== "SUCCEEDED" ||
    conflictB.json?.error?.code !== "RUNTIME_PROTOCOL_FAILURE"
  ) {
    throw new Error("Conflicting duplicate executionId not rejected.");
  }
  recordScenario("Identity: conflicting duplicate executionId", "pass");

  const coalesceBody = {
    ...baseBody,
    executionId: "a25-coalesce-id",
    input: runInputForProvider(provider, "slow"),
  };
  const [c1, c2] = await Promise.all([
    postSidecarExecute(port, coalesceBody),
    postSidecarExecute(port, coalesceBody),
  ]);
  if (c1.json?.outcome !== "SUCCEEDED" || c2.json?.outcome !== "SUCCEEDED") {
    throw new Error("Coalesced duplicate failed.");
  }
  if (JSON.stringify(c1.json) !== JSON.stringify(c2.json)) {
    throw new Error("Coalesced responses differ.");
  }
  recordScenario("Identity: duplicate executionId coalesced", "pass");

  const unsafe = await postSidecarExecute(port, {
    ...baseBody,
    executionId: `a25-unsafe-${randomUUID()}`,
    input: { prompt: "x", command: "/bin/sh", provider: "gemini" },
  });
  if (unsafe.json?.outcome === "SUCCEEDED") {
    throw new Error("Unsafe run input overrides were accepted.");
  }
  recordScenario("CLI security: provider/command override rejected", "pass");
}

async function scanLogsForCapabilityToken() {
  const { stdout } = runCapture(
    "docker",
    [...composeArgs(["logs", "--no-color", "cli-sidecar", "worker"])],
    { cwd: DOCKER_DIR },
  );
  if (stdout.includes(CAPABILITY_TOKEN_PROBE)) {
    recordScenario("Capability token not in sidecar/worker logs", "fail");
    throw new Error("Capability token leaked to container logs.");
  }
  recordScenario("Capability token not in sidecar/worker logs", "pass");
}

function sanitizeEvidenceForDisk(report) {
  const clone = structuredClone(report);
  if (clone.deploymentProvenance?.osvaSource) {
    clone.deploymentProvenance.osvaSource = "<osva-rc3-source>";
  }
  for (const key of ["adapterTarball", "sidecarTarball"]) {
    if (clone.deploymentProvenance?.[key]) {
      clone.deploymentProvenance[key] = `<${key}>`;
    }
  }
  return clone;
}

async function writeEvidenceReport() {
  evidence.finishedAt = new Date().toISOString();
  const outDir = path.join(SCRIPT_DIR, "evidence");
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest.json");
  await writeFile(
    jsonPath,
    `${JSON.stringify(sanitizeEvidenceForDisk(evidence), null, 2)}\n`,
  );
  console.log(`Evidence written: ${jsonPath}`);
}

function assertAllScenariosPassed() {
  const bad = evidence.scenarios.filter((s) => s.status !== "pass");
  if (bad.length === 0) {
    return;
  }
  const summary = bad.map((s) => `${s.name} (${s.status})`).join("; ");
  throw new Error(`A2.5 scenarios not all PASS: ${summary}`);
}

async function captureGitRef() {
  try {
    const { stdout } = runCapture("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
    });
    evidence.gitRef = stdout.trim();
  } catch {
    evidence.gitRef = "unknown";
  }
}

async function main() {
  if (process.env.OSVA_A25_SKIP_DOCKER === "1") {
    console.log("OSVA_A25_SKIP_DOCKER=1 — skipping Docker acceptance.");
    recordScenario("Docker deployment acceptance", "skip", {
      verification: "audit-only",
    });
    await writeEvidenceReport();
    console.error(
      "A2.5 deployment acceptance skipped — cannot satisfy release gate.",
    );
    process.exit(1);
  }

  let dockerAvailable = true;
  try {
    runCapture("docker", ["version"]);
  } catch {
    dockerAvailable = false;
  }
  if (!dockerAvailable) {
    recordScenario("Docker deployment acceptance", "blocked", {
      verification: "Docker not available",
    });
    await writeEvidenceReport();
    console.error("A2.5 deployment acceptance blocked — Docker not available.");
    process.exit(1);
  }

  await captureGitRef();
  await ensureEnvFile();
  const osvaSource = await resolveOsvaSource();
  if (!evidence.deploymentProvenance.osvaSource) {
    evidence.deploymentProvenance.osvaSource = osvaSource;
  }

  await packAdapter();
  await packSidecar();

  if (process.env.OSVA_A25_SKIP_BASE_BUILD === "1") {
    run("docker", [
      "build",
      "-t",
      ADAPTER_IMAGE,
      "-f",
      path.join(DOCKER_DIR, "Dockerfile.osva-with-azure-adapter"),
      "--build-arg",
      `OSVA_BASE_IMAGE=${BASE_IMAGE}`,
      DOCKER_DIR,
    ]);
    run("docker", [
      "build",
      "-t",
      SIDECAR_IMAGE,
      "-f",
      path.join(DOCKER_DIR, "Dockerfile.runtime-cli-sidecar"),
      DOCKER_DIR,
    ]);
  } else {
    buildImages(osvaSource);
  }

  composeDown();
  let acceptanceFailed = false;
  let stackStarted = false;
  try {
    try {
      composeUp();
    } catch (composeError) {
      acceptanceFailed = true;
      stackStarted = true;
      await captureFailureDiagnostics("compose-up-wait", composeError);
      throw composeError;
    }
    stackStarted = true;
    const session = await bootstrapInstallation();
    const webPort = await readWebPort();
    const sidecarPort = await readSidecarHostPort();
    const baseUrl = `http://127.0.0.1:${webPort}`;

    await pollUntil("web /health", async () => {
      const res = await fetch(`${baseUrl}/health`);
      return res.ok;
    });

    recordScenario("Compose stack healthy", "pass");

    await workerProviderScenario(baseUrl, session, "fixture");
    await workerFailureScenario(baseUrl, session, "fixture");

    for (const provider of ["gemini", "codex", "claude"]) {
      await recreateSidecarProvider(provider);
      await workerProviderScenario(baseUrl, session, provider);
      await workerFailureScenario(baseUrl, session, provider);
    }

    await recreateSidecarProvider("gemini");
    await directHttpSecurityScenarios(sidecarPort, "gemini");
    await scanLogsForCapabilityToken();

    run("docker", [...composeArgs(["restart", "cli-sidecar"])], {
      cwd: DOCKER_DIR,
    });
    await pollUntil("sidecar after restart", async () => {
      const res = await fetch(`http://127.0.0.1:${sidecarPort}/health/ready`);
      return res.ok;
    });
    recordScenario("Sidecar restart recovery", "pass");
  } catch (error) {
    acceptanceFailed = true;
    await captureFailureDiagnostics("acceptance-scenario", error);
    throw error;
  } finally {
    if (stackStarted) {
      try {
        composeDownUnlessKept(acceptanceFailed);
        if (acceptanceFailed && KEEP_COMPOSE_ON_FAILURE) {
          recordScenario("Cleanup compose stack", "skip", {
            reason: "OSVA_A25_KEEP_COMPOSE_ON_FAILURE=1",
          });
        } else {
          recordScenario("Cleanup compose stack", "pass");
        }
      } catch (cleanupError) {
        recordScenario("Cleanup compose stack", "fail", {
          error: String(cleanupError),
        });
      }
    }
    await writeEvidenceReport();
  }

  assertAllScenariosPassed();
  console.log("A2.5 deployment acceptance passed.");
}

main().catch(async (error) => {
  recordScenario("A2.5 runner", "fail", {
    error: error instanceof Error ? error.message : String(error),
  });
  await captureFailureDiagnostics("runner", error);
  try {
    composeDownUnlessKept(true);
  } catch {
    // ignore
  }
  try {
    await writeEvidenceReport();
  } catch {
    // ignore
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
