#!/usr/bin/env node
/**
 * A1.4 — OSVA deployment acceptance: registered @osva-ai/adapter-artifact-azure + Azurite.
 *
 * Requires Docker Compose v2, Node 24+, pnpm, and an OSVA v1.1.0-rc.3 source tree
 * (OSVA_RC3_SOURCE or shallow clone).
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

import { pollUntil } from "./lib/poll.mjs";
import { run, runCapture } from "./lib/shell.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOCKER_DIR = path.join(SCRIPT_DIR, "docker");
const ADAPTER_DIR = path.join(REPO_ROOT, "packages", "artifact-azure");
const COMPOSE_FILE = path.join(DOCKER_DIR, "compose.yml");
const ENV_FILE = path.join(DOCKER_DIR, ".env");
const ENV_EXAMPLE = path.join(DOCKER_DIR, ".env.example");

const OSVA_RC3_TAG = "v1.1.0-rc.3";
const OSVA_RC3_COMMIT = "744c1bbd8f968bc8c0293de5372fb9e59964286c";
const BASE_IMAGE = "osva:1.1.0-rc.3-a14-base";
const ADAPTER_IMAGE = "osva-a14-with-azure:local";

const AZURITE_ACCOUNT_KEY_FRAGMENT =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq";

const evidence = {
  slice: "A1.4",
  osvaTag: OSVA_RC3_TAG,
  osvaCommit: OSVA_RC3_COMMIT,
  adapterPackage: "@osva-ai/adapter-artifact-azure",
  contractsVersion: "1.1.0-rc.3",
  startedAt: new Date().toISOString(),
  scenarios: [],
  moduleResolution: [],
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
    status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`[${label}] ${name}`);
}

async function ensureEnvFile() {
  try {
    await readFile(ENV_FILE, "utf8");
  } catch {
    await copyFile(ENV_EXAMPLE, ENV_FILE);
    console.log(`Created ${ENV_FILE} from example (test-only credentials).`);
  }
}

async function resolveOsvaSource() {
  const configured = process.env.OSVA_RC3_SOURCE?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  const cloneRoot = await mkdtemp(path.join(os.tmpdir(), "osva-rc3-src-"));
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    OSVA_RC3_TAG,
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
    path.join(os.tmpdir(), "osva-a14-adapter-pack-"),
  );
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: ADAPTER_DIR });
  const { readdir } = await import("node:fs/promises");
  const tgzName = (await readdir(packDir)).find((name) =>
    name.endsWith(".tgz"),
  );
  if (!tgzName) {
    throw new Error("Adapter pack did not produce a tarball.");
  }
  const src = path.join(packDir, tgzName);
  const dest = path.join(DOCKER_DIR, "adapter-artifact-azure.tgz");
  await copyFile(src, dest);
  await rm(packDir, { recursive: true, force: true });
  const pkg = JSON.parse(
    await readFile(path.join(ADAPTER_DIR, "package.json"), "utf8"),
  );
  evidence.deploymentProvenance.adapterTarball = dest;
  evidence.deploymentProvenance.adapterVersion = pkg.version;
  return dest;
}

function buildImages(osvaSource) {
  const ghcrRc3 = "ghcr.io/osva-ai/osva:1.1.0-rc.3";
  let baseFromRegistry = false;
  try {
    runCapture("docker", ["manifest", "inspect", ghcrRc3]);
    baseFromRegistry = true;
  } catch {
    baseFromRegistry = false;
  }

  if (baseFromRegistry) {
    evidence.deploymentProvenance.baseImage = ghcrRc3;
    evidence.deploymentProvenance.baseImageProvenance = "ghcr-published-rc3";
    run("docker", ["tag", ghcrRc3, BASE_IMAGE]);
  } else {
    evidence.deploymentProvenance.baseImage = BASE_IMAGE;
    evidence.deploymentProvenance.baseImageProvenance =
      "local-docker-build-from-osva-rc3-tag";
    evidence.deploymentProvenance.osvaSource =
      evidence.deploymentProvenance.osvaSource ?? osvaSource;
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
}

function composeDown() {
  run("docker", [...composeArgs(["down", "-v", "--remove-orphans"])], {
    cwd: DOCKER_DIR,
  });
}

function composeUp() {
  run("docker", [...composeArgs(["up", "-d", "--wait"])], { cwd: DOCKER_DIR });
}

function parseBootstrapOutput(text) {
  const workspaceMatch = text.match(/Workspace ID: (\S+)/);
  const tokenLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("osva_ak_"));
  if (!workspaceMatch || !tokenLine) {
    throw new Error("Failed to parse bootstrap output for workspace/API key.");
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

function sha256IntegrityDigest(buffer) {
  const hex = createHash("sha256").update(buffer).digest("hex");
  return `sha256:${hex}`;
}

async function probeModuleResolution(service) {
  const entrypoints = {
    web: "/app/apps/web/dist/main.js",
    worker: "/app/apps/worker/dist/main.js",
    "knowledge-worker": "/app/apps/knowledge-worker/dist/main.js",
  };
  const loaderDir = "/app/adapters/artifact-storage/dist";
  const { stdout } = runCapture(
    "docker",
    [
      ...composeArgs([
        "exec",
        "-w",
        loaderDir,
        service,
        "node",
        `${loaderDir}/probe-module-resolution.mjs`,
      ]),
    ],
    { cwd: DOCKER_DIR },
  );
  const line = stdout.trim().split("\n").at(-1) ?? "";
  evidence.moduleResolution.push({
    process: service,
    entrypoint: entrypoints[service],
    resolutionContext: `${loaderDir}/registered-loader.js (same as OSVA dynamic import)`,
    result: line,
  });
  if (!line.startsWith("RESOLVED")) {
    throw new Error(`Module resolution failed for ${service}: ${stdout}`);
  }
}

async function uploadArtifact(baseUrl, auth, name, mediaType, bytes) {
  const form = new FormData();
  form.append("name", name);
  form.append("mediaType", mediaType);
  form.append("file", new Blob([bytes], { type: mediaType }), name);
  const response = await fetch(`${baseUrl}/v1/artifacts`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const body = await response.json();
  if (response.status !== 201) {
    throw new Error(
      `Artifact upload failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function runCrossProcessScenarios(baseUrl, session) {
  const { apiKey, workspaceId } = session;
  const webPayload = Buffer.from(`a14-web-artifact-${randomUUID()}`, "utf8");
  const webArtifact = await uploadArtifact(
    baseUrl,
    apiHeaders(apiKey, workspaceId),
    "web-direct.txt",
    "text/plain",
    webPayload,
  );
  const webDownload = await fetch(
    `${baseUrl}/v1/artifacts/${webArtifact.id}/content`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  const webBytes = Buffer.from(await webDownload.arrayBuffer());
  const webDigest = webDownload.headers.get("digest");
  if (webDownload.status !== 200 || !webBytes.equals(webPayload)) {
    throw new Error("Web artifact readback failed.");
  }
  if (webDigest !== sha256IntegrityDigest(webPayload)) {
    throw new Error(
      `Digest mismatch: expected ${sha256IntegrityDigest(webPayload)}, got ${webDigest}`,
    );
  }
  recordScenario("Web process artifact write/read", "pass", {
    artifactId: webArtifact.id,
    digest: webDigest,
  });

  const remoteEndpoint = "http://fake-runtime:9090/execute";
  const agentKey = `a14-agent-${Date.now()}`;
  const agentRes = await fetchJson(`${baseUrl}/v1/agents`, {
    method: "POST",
    headers: {
      ...apiHeaders(apiKey, workspaceId),
      "content-type": "application/json",
    },
    body: JSON.stringify({ key: agentKey, name: "A14 Remote Artifact Agent" }),
  });
  if (agentRes.status !== 201) {
    throw new Error(`Create agent failed: ${JSON.stringify(agentRes.body)}`);
  }
  const agentId = agentRes.body.id;
  const workerPayload = `a14-worker-artifact-${randomUUID()}`;
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
          name: "A14 Remote Artifact Agent",
          runtime: {
            type: "REMOTE_HTTP",
            protocolVersion: "1",
            endpoint: remoteEndpoint,
          },
          input: { schema: {} },
          output: { schema: {} },
          execution: { timeoutMs: 30_000, maxAttempts: 1 },
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
  const runRes = await fetchJson(`${baseUrl}/v1/runs`, {
    method: "POST",
    headers: {
      ...apiHeaders(apiKey, workspaceId),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      agentVersionId: versionRes.body.id,
      input: { content: workerPayload },
    }),
  });
  if (runRes.status !== 201) {
    throw new Error(`Create run failed: ${JSON.stringify(runRes.body)}`);
  }
  const runId = runRes.body.run.id;
  const runAttemptId = runRes.body.runAttempt.id;

  await pollUntil("worker run SUCCEEDED", async () => {
    const statusRes = await fetchJson(`${baseUrl}/v1/runs/${runId}`, {
      headers: apiHeaders(apiKey, workspaceId),
    });
    return statusRes.body?.status === "SUCCEEDED";
  });

  const attemptRes = await fetchJson(
    `${baseUrl}/v1/runs/${runId}/attempts/${runAttemptId}`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  const finalArtifactId = attemptRes.body.output.reference.artifactId;

  const workerDownload = await fetch(
    `${baseUrl}/v1/artifacts/${finalArtifactId}/content`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  const workerBytes = Buffer.from(await workerDownload.arrayBuffer());
  if (
    workerDownload.status !== 200 ||
    workerBytes.toString("utf8") !== workerPayload
  ) {
    throw new Error("Worker-generated artifact not readable via web.");
  }
  recordScenario("Worker-generated artifact accessible through web", "pass", {
    runId,
    artifactId: finalArtifactId,
  });

  const knowledgeBody = [
    "A14 knowledge handbook",
    "",
    "Refund policy: returns within thirty days.",
    "Billing contact: finance@example.test",
  ].join("\n");
  const sourceArtifact = await uploadArtifact(
    baseUrl,
    apiHeaders(apiKey, workspaceId),
    "handbook.txt",
    "text/plain",
    Buffer.from(knowledgeBody, "utf8"),
  );
  const sourceRes = await fetchJson(`${baseUrl}/v1/knowledge-sources`, {
    method: "POST",
    headers: {
      ...apiHeaders(apiKey, workspaceId),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      key: `handbook-${Date.now()}`,
      name: "A14 Handbook",
      artifactId: sourceArtifact.id,
    }),
  });
  if (sourceRes.status !== 201) {
    throw new Error(
      `Knowledge source create failed: ${JSON.stringify(sourceRes.body)}`,
    );
  }
  const indexRes = await fetchJson(
    `${baseUrl}/v1/knowledge-sources/${sourceRes.body.id}/indexes`,
    {
      method: "POST",
      headers: {
        ...apiHeaders(apiKey, workspaceId),
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );
  if (indexRes.status !== 201) {
    throw new Error(
      `Knowledge index create failed: ${JSON.stringify(indexRes.body)}`,
    );
  }
  const indexId = indexRes.body.id;

  const readyIndex = await pollUntil(
    "knowledge index READY",
    async () => {
      const idx = await fetchJson(
        `${baseUrl}/v1/knowledge-indexes/${indexId}`,
        {
          headers: apiHeaders(apiKey, workspaceId),
        },
      );
      if (idx.body?.status === "FAILED") {
        throw new Error(`Knowledge index failed: ${JSON.stringify(idx.body)}`);
      }
      return idx.body?.status === "READY" ? idx.body : false;
    },
    { timeoutMs: 180_000 },
  );

  const extractedId = readyIndex.extractedArtifactId;
  if (!extractedId) {
    throw new Error("Knowledge index READY but missing extractedArtifactId.");
  }
  const extractedDownload = await fetch(
    `${baseUrl}/v1/artifacts/${extractedId}/content`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  const extractedText = await extractedDownload.text();
  if (
    extractedDownload.status !== 200 ||
    !extractedText.includes("Refund policy")
  ) {
    throw new Error(
      "Knowledge worker did not produce readable extracted artifact bytes.",
    );
  }
  recordScenario(
    "Knowledge worker reads persisted source bytes (ingestion → extracted artifact)",
    "pass",
    {
      indexId,
      sourceArtifactId: sourceArtifact.id,
      extractedArtifactId: extractedId,
    },
  );

  const persistenceId = webArtifact.id;
  const persistenceDigest = webDigest;
  run(
    "docker",
    [...composeArgs(["restart", "web", "worker", "knowledge-worker"])],
    {
      cwd: DOCKER_DIR,
    },
  );
  await pollUntil("web healthy after restart", async () => {
    const res = await fetch(`${baseUrl}/health`);
    return res.ok;
  });
  const afterRestart = await fetch(
    `${baseUrl}/v1/artifacts/${persistenceId}/content`,
    { headers: apiHeaders(apiKey, workspaceId) },
  );
  const afterBytes = Buffer.from(await afterRestart.arrayBuffer());
  if (
    afterRestart.status !== 200 ||
    !afterBytes.equals(webPayload) ||
    afterRestart.headers.get("digest") !== persistenceDigest
  ) {
    throw new Error("Artifact bytes not persisted across process restart.");
  }
  recordScenario("Restart persistence (Azurite-backed)", "pass", {
    artifactId: persistenceId,
  });

  return { persistenceId, workerArtifactId: finalArtifactId };
}

function assertStartupFailure(service, envOverrides, expectPattern) {
  const args = [
    ...composeArgs([
      "run",
      "--rm",
      "--no-deps",
      "-e",
      `OSVA_PROCESS=${service}`,
      ...Object.entries(envOverrides).flatMap(([key, value]) => [
        "-e",
        `${key}=${value}`,
      ]),
      service,
    ]),
  ];
  const result = spawnSync("docker", args, {
    cwd: DOCKER_DIR,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0) {
    throw new Error(
      `Expected ${service} startup failure but process exited 0.`,
    );
  }
  if (expectPattern && !expectPattern.test(combined)) {
    throw new Error(
      `Startup failed as expected but logs did not match ${expectPattern}: ${combined.slice(0, 800)}`,
    );
  }
}

function negativeScenarios() {
  assertStartupFailure(
    "web",
    {
      OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE:
        "@osva-ai/adapter-artifact-azure-not-installed",
      OSVA_WEB_HOST: "0.0.0.0",
      OSVA_WEB_PORT: "3000",
      OSVA_AUTH_SECRET: "a14-negative-test-secret-0123456789",
    },
    /Failed to import registered artifact blob store module/i,
  );
  recordScenario("Invalid registration module fails closed at startup", "pass");

  assertStartupFailure(
    "web",
    {
      OSVA_ARTIFACT_AZURE_CONTAINER: "INVALID_UPPERCASE",
      OSVA_ARTIFACT_AZURE_CONNECTION_STRING: "",
      OSVA_ARTIFACT_AZURE_ACCOUNT_NAME: "",
      OSVA_ARTIFACT_AZURE_ACCOUNT_KEY: "",
      OSVA_WEB_HOST: "0.0.0.0",
      OSVA_WEB_PORT: "3000",
      OSVA_AUTH_SECRET: "a14-negative-test-secret-0123456789",
    },
    /OSVA_ARTIFACT_AZURE_CONTAINER|configuration|Azure/i,
  );
  recordScenario(
    "Incorrect Azure backend config fails without fallback",
    "pass",
  );
}

function scanLogsForSecrets() {
  const services = ["web", "worker", "knowledge-worker", "azurite-init"];
  let leaked = false;
  for (const service of services) {
    const { stdout } = runCapture(
      "docker",
      [...composeArgs(["logs", "--no-color", service])],
      { cwd: DOCKER_DIR },
    );
    if (
      stdout.includes("AccountKey=") ||
      stdout.includes(AZURITE_ACCOUNT_KEY_FRAGMENT)
    ) {
      leaked = true;
      recordScenario(`Secret scan: ${service} logs`, "fail", {
        detail: "Found storage key material in logs",
      });
    }
  }
  if (!leaked) {
    recordScenario("No secret values in normal service logs", "pass");
  } else {
    throw new Error("Storage account key material appeared in service logs.");
  }
}

function sanitizeEvidenceForDisk(report) {
  const clone = structuredClone(report);
  if (clone.deploymentProvenance?.osvaSource) {
    clone.deploymentProvenance.osvaSource = "<local-osva-rc3-checkout>";
  }
  if (clone.deploymentProvenance?.adapterTarball) {
    clone.deploymentProvenance.adapterTarball =
      "scripts/acceptance/a1-4/docker/adapter-artifact-azure.tgz";
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

async function main() {
  const skipDocker = process.env.OSVA_A14_SKIP_DOCKER === "1";
  if (skipDocker) {
    console.log(
      "OSVA_A14_SKIP_DOCKER=1 — audit-only mode, skipping Docker acceptance.",
    );
    return;
  }

  await ensureEnvFile();
  const osvaSource = await resolveOsvaSource();
  if (!evidence.deploymentProvenance.osvaSource) {
    evidence.deploymentProvenance.osvaSource = osvaSource;
    evidence.deploymentProvenance.osvaSourceMode = process.env.OSVA_RC3_SOURCE
      ? "operator-provided"
      : "ephemeral-clone";
  }

  await packAdapter();
  if (process.env.OSVA_A14_SKIP_BASE_BUILD === "1") {
    evidence.deploymentProvenance.baseImage = BASE_IMAGE;
    evidence.deploymentProvenance.baseImageProvenance =
      "reuse-local-image-osva-a14-skip-base-build";
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
    evidence.deploymentProvenance.adapterImage = ADAPTER_IMAGE;
  } else {
    buildImages(osvaSource);
  }

  composeDown();
  try {
    composeUp();

    for (const service of ["web", "worker", "knowledge-worker"]) {
      await probeModuleResolution(service);
    }
    recordScenario(
      "Registered module loads from independent package install",
      "pass",
      {
        module: "@osva-ai/adapter-artifact-azure",
        resolution: evidence.moduleResolution,
      },
    );

    const auth = await bootstrapInstallation();
    const envText = await readFile(ENV_FILE, "utf8");
    const portMatch = envText.match(/^OSVA_PUBLISH_WEB_PORT=(\d+)/m);
    const webPort = portMatch?.[1] ?? "18080";
    const baseUrl = `http://127.0.0.1:${webPort}`;

    await pollUntil("web /health", async () => {
      const res = await fetch(`${baseUrl}/health`);
      return res.ok;
    });

    await runCrossProcessScenarios(baseUrl, auth);
    scanLogsForSecrets();
    negativeScenarios();
  } finally {
    try {
      composeDown();
      recordScenario("Cleanup removes compose stack and volumes", "pass");
    } catch (cleanupError) {
      recordScenario("Cleanup removes compose stack and volumes", "fail", {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
    }
    await writeEvidenceReport();
  }

  console.log("A1.4 deployment acceptance passed.");
}

main().catch(async (error) => {
  recordScenario("A1.4 runner", "fail", {
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    composeDown();
  } catch {
    // ignore cleanup errors
  }
  try {
    await writeEvidenceReport();
  } catch {
    // ignore
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
