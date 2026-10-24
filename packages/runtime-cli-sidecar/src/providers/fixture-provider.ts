import type { JsonValue } from "@osva-ai/contracts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPathUnderRoot } from "../paths.js";
import type {
  CliExecutionInput,
  CliExecutionProvider,
  CliExecutionResult,
  CliLaunchSpec,
} from "../types.js";

export interface FixtureCliProviderOptions {
  readonly fixtureScriptPath?: string;
  readonly workspaceRoot: string;
}

function fixtureScriptDefaultPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../fixtures/osva-fixture-cli.mjs");
}

function readScenario(runInput: JsonValue): string {
  if (
    runInput === null ||
    typeof runInput !== "object" ||
    Array.isArray(runInput)
  ) {
    return "success";
  }
  const scenario = (runInput as Record<string, unknown>).scenario;
  return typeof scenario === "string" && scenario.length > 0
    ? scenario
    : "success";
}

export function createFixtureCliProvider(
  options: FixtureCliProviderOptions,
): CliExecutionProvider {
  const scriptPath = options.fixtureScriptPath ?? fixtureScriptDefaultPath();

  return {
    providerId: "fixture-cli",
    buildLaunch(input: CliExecutionInput): CliLaunchSpec {
      const scenario = readScenario(input.runInput);
      const cwd = assertPathUnderRoot(
        options.workspaceRoot,
        input.workingDirectory,
      );
      return {
        command: process.execPath,
        args: [scriptPath, "--scenario", scenario],
        cwd,
        env: {},
      };
    },
    parseOutput(
      stdout: string,
      stderr: string,
      exitCode: number | null,
    ): CliExecutionResult {
      if (exitCode !== 0) {
        return {
          classification: "cli_failure",
          outcome: "failure",
          ...(exitCode !== null ? { exitCode } : {}),
          stderrPreview: stderr.trim().slice(0, 500),
          durationMs: 0,
        };
      }
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        return {
          classification: "invalid_output",
          outcome: "failure",
          durationMs: 0,
        };
      }
      try {
        const parsed = JSON.parse(trimmed) as JsonValue;
        return {
          classification: "completed",
          outcome: "success",
          output: parsed,
          durationMs: 0,
        };
      } catch {
        return {
          classification: "invalid_output",
          outcome: "failure",
          durationMs: 0,
        };
      }
    },
  };
}
