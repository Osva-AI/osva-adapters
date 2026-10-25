import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createClaudeCliProvider } from "../src/providers/claude-provider.js";
import { createCodexCliProvider } from "../src/providers/codex-provider.js";
import { createGeminiCliProvider } from "../src/providers/gemini-provider.js";
import { createCliSidecar } from "../src/sidecar.js";
import {
  buildExecuteBody,
  createTestConfig,
  postExecute,
  PROTOCOL_VERSION,
} from "./helpers.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

function scenarioPrompt(scenario: string): string {
  return `__osva_scenario=${scenario}__ conformance`;
}

function wrapWithFixture(
  base: ReturnType<typeof createGeminiCliProvider>,
  fixtureName: "gemini" | "codex" | "claude",
) {
  const script = path.join(fixturesDir, `osva-fixture-${fixtureName}-cli.mjs`);
  return {
    providerId: base.providerId,
    buildLaunch(input: Parameters<typeof base.buildLaunch>[0]) {
      const launch = base.buildLaunch(input);
      return {
        ...launch,
        command: process.execPath,
        args: [script, ...launch.args],
      };
    },
    parseOutput: base.parseOutput.bind(base),
  };
}

async function startProviderSidecar(
  provider: "gemini" | "codex" | "claude",
  workspaceRoot: string,
) {
  const base =
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

  const wrapped = wrapWithFixture(base, provider);
  const config = createTestConfig(workspaceRoot, { cliProvider: provider });
  const sidecar = createCliSidecar({ provider: wrapped, config });
  await sidecar.listen();
  const address = sidecar.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP port.");
  }
  return {
    sidecar,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
  };
}

describe("CLI provider conformance (fixture-backed)", () => {
  for (const provider of ["gemini", "codex", "claude"] as const) {
    describe(provider, () => {
      it("returns SUCCEEDED for success scenario", async () => {
        const { mkdtemp } = await import("node:fs/promises");
        const os = await import("node:os");
        const workspaceRoot = await mkdtemp(
          path.join(os.tmpdir(), `conf-${provider}-`),
        );
        const { sidecar, baseUrl } = await startProviderSidecar(
          provider,
          workspaceRoot,
        );
        try {
          const { json } = await postExecute(
            baseUrl,
            buildExecuteBody({
              executionId: `${provider}-conf-success`,
              input: { prompt: scenarioPrompt("success") },
            }),
          );
          expect(json).toMatchObject({
            outcome: "SUCCEEDED",
            protocolVersion: PROTOCOL_VERSION,
          });
        } finally {
          await sidecar.close();
        }
      });

      it("returns FAILED for fail-exit scenario", async () => {
        const { mkdtemp } = await import("node:fs/promises");
        const os = await import("node:os");
        const workspaceRoot = await mkdtemp(
          path.join(os.tmpdir(), `conf-${provider}-fail-`),
        );
        const { sidecar, baseUrl } = await startProviderSidecar(
          provider,
          workspaceRoot,
        );
        try {
          const { json } = await postExecute(
            baseUrl,
            buildExecuteBody({
              executionId: `${provider}-conf-fail`,
              input: { prompt: scenarioPrompt("fail-exit") },
            }),
          );
          expect(json).toMatchObject({ outcome: "FAILED" });
        } finally {
          await sidecar.close();
        }
      });

      it("classifies malformed CLI output as failure", async () => {
        const { mkdtemp } = await import("node:fs/promises");
        const os = await import("node:os");
        const workspaceRoot = await mkdtemp(
          path.join(os.tmpdir(), `conf-${provider}-bad-`),
        );
        const { sidecar, baseUrl } = await startProviderSidecar(
          provider,
          workspaceRoot,
        );
        try {
          const { json } = await postExecute(
            baseUrl,
            buildExecuteBody({
              executionId: `${provider}-conf-malformed`,
              input: { prompt: scenarioPrompt("malformed-json") },
            }),
          );
          expect(json).toMatchObject({ outcome: "FAILED" });
        } finally {
          await sidecar.close();
        }
      });
    });
  }
});
