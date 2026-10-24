#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killProcessTree } from "./lib/run-with-deadline.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SIDECAR_PACKAGE_DIR = path.join(
  REPO_ROOT,
  "packages",
  "runtime-cli-sidecar",
);

const OFFICIAL_CONTRACTS_VERSION = "1.1.0-rc.3";
const OFFICIAL_SDK_VERSION = "1.1.0-rc.3";
const OFFICIAL_RUNTIME_PROTOCOL_VERSION = "1.1.0-rc.3";

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
}

async function packSidecar() {
  run("pnpm", ["--filter", "@osva-ai/runtime-cli-sidecar", "build"]);
  const packDir = await mkdtemp(path.join(os.tmpdir(), "osva-a21-pack-"));
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

async function main() {
  const workRoot = await mkdtemp(
    path.join(os.tmpdir(), "osva-a21-external-consumer-"),
  );
  const consumerRoot = path.join(workRoot, "consumer");
  let packDir;
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let sidecarProcess;

  try {
    const packed = await packSidecar();
    packDir = packed.packDir;

    await mkdir(consumerRoot, { recursive: true });
    await writeFile(
      path.join(consumerRoot, "package.json"),
      JSON.stringify(
        {
          name: "osva-a21-consumer",
          private: true,
          type: "module",
        },
        null,
        2,
      ),
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
      "bin",
      "start-sidecar.js",
    );

    const logs = [];
    sidecarProcess = spawn(process.execPath, [sidecarEntry], {
      cwd: consumerRoot,
      env: {
        ...process.env,
        OSVA_SIDECAR_HOST: "127.0.0.1",
        OSVA_SIDECAR_PORT: "19321",
        OSVA_SIDECAR_DEFAULT_DEADLINE_MS: "15000",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    sidecarProcess.stdout?.on("data", (chunk) => {
      logs.push(String(chunk));
    });
    sidecarProcess.stderr?.on("data", (chunk) => {
      logs.push(String(chunk));
    });

    await waitForSidecar("19321", 20_000);

    const baseUrl = "http://127.0.0.1:19321";
    const successBody = {
      protocolVersion: "1",
      executionId: "a21-external-success",
      input: { scenario: "success" },
      capabilities: {
        endpoint: "http://127.0.0.1:1",
        token: "super-secret-capability-token",
      },
    };

    const successResponse = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(successBody),
    });
    const successJson = await successResponse.json();
    if (successJson.outcome !== "SUCCEEDED") {
      throw new Error(`Expected SUCCEEDED, got ${JSON.stringify(successJson)}`);
    }

    const failResponse = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...successBody,
        executionId: "a21-external-fail",
        input: { scenario: "fail" },
      }),
    });
    const failJson = await failResponse.json();
    if (failJson.outcome !== "FAILED") {
      throw new Error(`Expected FAILED, got ${JSON.stringify(failJson)}`);
    }

    const timeoutResponse = await fetch(`${baseUrl}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...successBody,
        executionId: "a21-external-hang",
        input: { scenario: "hang", deadlineMs: 500 },
      }),
    });
    const timeoutJson = await timeoutResponse.json();
    if (
      timeoutJson.outcome !== "FAILED" ||
      !String(timeoutJson.error?.message ?? "").includes("timed out")
    ) {
      throw new Error(
        `Expected timeout failure, got ${JSON.stringify(timeoutJson)}`,
      );
    }

    const joinedLogs = logs.join("\n");
    if (joinedLogs.includes("super-secret-capability-token")) {
      throw new Error("Capability token leaked to sidecar stdout logs.");
    }

    console.log("A2.1 external pack consumer acceptance passed.");
  } finally {
    if (sidecarProcess?.pid !== undefined) {
      killProcessTree(sidecarProcess.pid);
    }
    if (packDir !== undefined) {
      await rm(packDir, { recursive: true, force: true });
    }
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function waitForSidecar(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Sidecar did not become ready on port ${port}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
