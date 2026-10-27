#!/usr/bin/env node
/**
 * External npm consumer for A2.2–A2.4 vendor providers (fixture-backed CLIs).
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnCommand } from "./lib/spawn-package-manager.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SIDECAR_PACKAGE_DIR = path.join(
  REPO_ROOT,
  "packages",
  "runtime-cli-sidecar",
);

function fixturePathForProvider(consumerRoot, provider) {
  return path.join(
    consumerRoot,
    "node_modules",
    "@osva-ai",
    "runtime-cli-sidecar",
    "fixtures",
    `osva-fixture-${provider}-cli.mjs`,
  );
}

const OFFICIAL_CONTRACTS_VERSION = "1.1.0-rc.4";
const OFFICIAL_SDK_VERSION = "1.1.0-rc.4";
const OFFICIAL_RUNTIME_PROTOCOL_VERSION = "1.1.0-rc.4";

function run(command, args, options = {}) {
  spawnCommand(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? "inherit",
    env: options.env,
    repoRoot: REPO_ROOT,
  });
}

async function packSidecar() {
  run("pnpm", ["--filter", "@osva-ai/runtime-cli-sidecar", "build"]);
  const packDir = await mkdtemp(path.join(os.tmpdir(), "osva-a224-pack-"));
  run("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: SIDECAR_PACKAGE_DIR,
  });
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(packDir)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (files.length !== 1) {
    throw new Error(`Expected one tarball, found ${files.join(", ")}`);
  }
  return { tgz: path.join(packDir, files[0]), packDir };
}

function scenarioPrompt(scenario) {
  return `__osva_scenario=${scenario}__ external-consumer`;
}

async function exerciseProvider(
  consumerRoot,
  provider,
  port,
  logs,
  sidecarModule,
) {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), `osva-a224-ws-${provider}-`),
  );
  await mkdir(workspaceRoot, { recursive: true });

  const {
    createGeminiCliProvider,
    createCodexCliProvider,
    createClaudeCliProvider,
    createCliSidecar,
  } = sidecarModule;

  const baseProvider =
    provider === "gemini"
      ? createGeminiCliProvider({
          workspaceRoot,
          command: process.execPath,
          sandbox: false,
          skipTrust: true,
        })
      : provider === "codex"
        ? createCodexCliProvider({
            workspaceRoot,
            command: process.execPath,
            sandbox: "read-only",
            skipGitRepoCheck: true,
          })
        : createClaudeCliProvider({
            workspaceRoot,
            command: process.execPath,
            bare: true,
            allowedTools: "Read",
          });

  const fixturePath = fixturePathForProvider(consumerRoot, provider);
  const wrappedProvider = {
    providerId: baseProvider.providerId,
    buildLaunch(input) {
      const launch = baseProvider.buildLaunch(input);
      return {
        ...launch,
        command: process.execPath,
        args: [fixturePath, ...launch.args],
      };
    },
    parseOutput: baseProvider.parseOutput.bind(baseProvider),
  };

  const sidecar = createCliSidecar({
    provider: wrappedProvider,
    config: {
      host: "127.0.0.1",
      port,
      executePath: "/execute",
      maxConcurrentExecutions: 2,
      defaultDeadlineMs: 15_000,
      maxStdoutBytes: 2_097_152,
      maxStderrBytes: 262_144,
      workspaceRoot,
      envAllowlist: ["PATH", "PATHEXT", "SystemRoot", "HOME", "USERPROFILE"],
      completedCacheMaxEntries: 32,
      completedCacheTtlMs: 60_000,
      draining: false,
      cliProvider: provider,
    },
    logger: (event) => logs.push(JSON.stringify(event)),
  });

  await sidecar.listen();

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const body = {
      protocolVersion: "1",
      executionId: `a224-${provider}-success`,
      input: { prompt: scenarioPrompt("success") },
      capabilities: {
        endpoint: "http://127.0.0.1:1",
        token: "super-secret-capability-token",
      },
    };

    const response = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (json.outcome !== "SUCCEEDED") {
      throw new Error(
        `${provider}: expected SUCCEEDED, got ${JSON.stringify(json)}`,
      );
    }

    const fail = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        executionId: `a224-${provider}-fail`,
        input: {
          prompt: scenarioPrompt(
            provider === "gemini"
              ? "fail-exit"
              : provider === "codex"
                ? "fail-exit"
                : "fail-exit",
          ),
        },
      }),
    });
    const failJson = await fail.json();
    if (failJson.outcome !== "FAILED") {
      throw new Error(
        `${provider}: expected FAILED, got ${JSON.stringify(failJson)}`,
      );
    }
  } finally {
    await sidecar.close();
  }
}

async function main() {
  const workRoot = await mkdtemp(
    path.join(os.tmpdir(), "osva-a224-external-consumer-"),
  );
  const consumerRoot = path.join(workRoot, "consumer");
  let packDir;
  const logs = [];

  try {
    const packed = await packSidecar();
    packDir = packed.packDir;

    await mkdir(consumerRoot, { recursive: true });
    await writeFile(
      path.join(consumerRoot, "package.json"),
      JSON.stringify({
        name: "osva-a224-consumer",
        private: true,
        type: "module",
      }),
    );

    run(
      "npm",
      [
        "install",
        "--no-save",
        packed.tgz,
        `@osva-ai/contracts@${OFFICIAL_CONTRACTS_VERSION}`,
        `@osva-ai/sdk@${OFFICIAL_SDK_VERSION}`,
        `@osva-ai/runtime-protocol@${OFFICIAL_RUNTIME_PROTOCOL_VERSION}`,
      ],
      { cwd: consumerRoot },
    );

    const sidecarEntry = path.join(
      consumerRoot,
      "node_modules",
      "@osva-ai",
      "runtime-cli-sidecar",
      "dist",
      "index.js",
    );
    const sidecarModule = await import(pathToFileURL(sidecarEntry).href);

    if (
      typeof sidecarModule.createGeminiCliProvider !== "function" ||
      typeof sidecarModule.createCodexCliProvider !== "function" ||
      typeof sidecarModule.createClaudeCliProvider !== "function" ||
      typeof sidecarModule.createCliSidecar !== "function"
    ) {
      throw new Error("Packed sidecar is missing vendor provider exports.");
    }

    for (const [index, provider] of ["gemini", "codex", "claude"].entries()) {
      await exerciseProvider(
        consumerRoot,
        provider,
        19400 + index,
        logs,
        sidecarModule,
      );
    }

    const joined = logs.join("\n");
    if (joined.includes("super-secret-capability-token")) {
      throw new Error("Capability token leaked to sidecar logs.");
    }

    console.log("A2.2–A2.4 external pack consumer acceptance passed.");
  } finally {
    if (packDir !== undefined) {
      await rm(packDir, { recursive: true, force: true });
    }
    await rm(workRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
