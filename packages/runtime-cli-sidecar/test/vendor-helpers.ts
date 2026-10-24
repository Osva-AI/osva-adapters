import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClaudeCliProvider } from "../src/providers/claude-provider.js";
import { createCodexCliProvider } from "../src/providers/codex-provider.js";
import { createGeminiCliProvider } from "../src/providers/gemini-provider.js";
import { createCliSidecar } from "../src/sidecar.js";
import type {
  CliExecutionProvider,
  SidecarConfig,
  SidecarLogEvent,
} from "../src/types.js";
import { createTestConfig } from "./helpers.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

export const VENDOR_FIXTURES = {
  gemini: path.join(fixturesDir, "osva-fixture-gemini-cli.mjs"),
  codex: path.join(fixturesDir, "osva-fixture-codex-cli.mjs"),
  claude: path.join(fixturesDir, "osva-fixture-claude-cli.mjs"),
} as const;

export type VendorFixtureKind = keyof typeof VENDOR_FIXTURES;

export function createVendorProvider(
  kind: VendorFixtureKind,
  workspaceRoot: string,
): CliExecutionProvider {
  const command = process.execPath;
  switch (kind) {
    case "gemini":
      return createGeminiCliProvider({
        workspaceRoot,
        command,
        sandbox: false,
        skipTrust: true,
        approvalMode: "default",
      });
    case "codex":
      return createCodexCliProvider({
        workspaceRoot,
        command: command,
        sandbox: "read-only",
        skipGitRepoCheck: true,
      });
    case "claude":
      return createClaudeCliProvider({
        workspaceRoot,
        command,
        bare: true,
        allowedTools: "Read",
      });
    default: {
      const _exhaustive: never = kind;
      throw new Error(String(_exhaustive));
    }
  }
}

/** Real providers pointed at fixture scripts via argv rewriting in tests. */
export function wrapFixtureArgvProvider(
  base: CliExecutionProvider,
  fixturePath: string,
): CliExecutionProvider {
  return {
    providerId: base.providerId,
    buildLaunch(input) {
      const launch = base.buildLaunch(input);
      return {
        ...launch,
        command: process.execPath,
        args: [fixturePath, ...launch.args],
      };
    },
    parseOutput: base.parseOutput.bind(base),
  };
}

export async function startVendorSidecar(
  kind: VendorFixtureKind,
  overrides: Partial<SidecarConfig> = {},
  logSink: SidecarLogEvent[] = [],
) {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), `osva-vendor-${kind}-`),
  );
  await mkdir(workspaceRoot, { recursive: true });
  const config = createTestConfig(workspaceRoot, {
    cliProvider: kind,
    ...overrides,
  });
  const provider = wrapFixtureArgvProvider(
    createVendorProvider(kind, workspaceRoot),
    VENDOR_FIXTURES[kind],
  );
  const sidecar = createCliSidecar({
    provider,
    config,
    logger: (event) => logSink.push(event),
  });
  await sidecar.listen();
  const address = sidecar.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected sidecar to listen on a TCP port.");
  }
  return {
    sidecar,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    workspaceRoot,
    config,
    registry: sidecar.registry,
    logSink,
  };
}

export function scenarioPrompt(scenario: string, userText = "run"): string {
  return `__osva_scenario=${scenario}__ ${userText}`;
}

export function buildVendorExecuteBody(options: {
  executionId: string;
  scenario?: string;
  prompt?: string;
  extraInput?: Record<string, unknown>;
}) {
  const scenario = options.scenario ?? "success";
  return {
    protocolVersion: "1" as const,
    executionId: options.executionId,
    input: {
      prompt: options.prompt ?? scenarioPrompt(scenario),
      ...options.extraInput,
    },
    capabilities: {
      endpoint: "http://127.0.0.1:1",
      token: "capability-token-secret-value",
    },
  };
}
