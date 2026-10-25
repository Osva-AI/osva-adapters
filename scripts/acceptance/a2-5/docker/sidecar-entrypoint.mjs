#!/usr/bin/env node
/**
 * Compose entrypoint: start sidecar with fixture-backed vendor CLIs (no live APIs).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const provider = (process.env.OSVA_SIDECAR_CLI_PROVIDER ?? "fixture").trim();

const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "node_modules",
  "@osva-ai",
  "runtime-cli-sidecar",
);
const sidecarEntry = path.join(packageRoot, "dist", "index.js");
const sidecarModule = await import(pathToFileURL(sidecarEntry).href);

const {
  createCliSidecar,
  createFixtureCliProvider,
  createGeminiCliProvider,
  createCodexCliProvider,
  createClaudeCliProvider,
  loadSidecarConfigFromEnv,
} = sidecarModule;

function fixturePath(name) {
  return path.join(packageRoot, "fixtures", `osva-fixture-${name}-cli.mjs`);
}

function wrapWithFixture(baseProvider, fixtureName) {
  const script = fixturePath(fixtureName);
  return {
    providerId: baseProvider.providerId,
    buildLaunch(input) {
      const launch = baseProvider.buildLaunch(input);
      return {
        ...launch,
        command: process.execPath,
        args: [script, ...launch.args],
      };
    },
    parseOutput: baseProvider.parseOutput.bind(baseProvider),
  };
}

const config = loadSidecarConfigFromEnv();
await mkdir(config.workspaceRoot, { recursive: true });

let providerImpl;
switch (provider) {
  case "fixture":
    providerImpl = createFixtureCliProvider({
      workspaceRoot: config.workspaceRoot,
    });
    break;
  case "gemini":
    providerImpl = wrapWithFixture(
      createGeminiCliProvider({
        workspaceRoot: config.workspaceRoot,
        command: process.execPath,
        sandbox: false,
        skipTrust: true,
      }),
      "gemini",
    );
    break;
  case "codex":
    providerImpl = wrapWithFixture(
      createCodexCliProvider({
        workspaceRoot: config.workspaceRoot,
        command: process.execPath,
        sandbox: "read-only",
        skipGitRepoCheck: true,
      }),
      "codex",
    );
    break;
  case "claude":
    providerImpl = wrapWithFixture(
      createClaudeCliProvider({
        workspaceRoot: config.workspaceRoot,
        command: process.execPath,
        bare: true,
        allowedTools: "Read",
      }),
      "claude",
    );
    break;
  default:
    throw new Error(`Unsupported OSVA_SIDECAR_CLI_PROVIDER: ${provider}`);
}

const sidecar = createCliSidecar({ provider: providerImpl, config });
await sidecar.listen();

console.log(
  JSON.stringify({
    event: "sidecar_listening",
    host: config.host,
    port: config.port,
    providerId: providerImpl.providerId,
    cliProvider: provider,
  }),
);

const shutdown = async (signal) => {
  console.log(JSON.stringify({ event: "sidecar_signal", signal }));
  try {
    await sidecar.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
