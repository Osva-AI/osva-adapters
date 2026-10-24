import { spawn } from "node:child_process";
import type { CliExecutionProvider } from "../types.js";
import type { CliProviderKind } from "./shared/provider-kinds.js";

async function probeBinary(
  command: string,
  args: readonly string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out probing CLI binary "${command}".`));
    }, 5000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || code === 1) {
        resolve();
        return;
      }
      reject(
        new Error(
          `CLI binary "${command}" probe exited with code ${String(code)}.`,
        ),
      );
    });
  });
}

/**
 * Best-effort startup validation for operator-configured vendor binaries.
 * Skipped for fixture provider and for node-based fixture paths in tests.
 */
export async function validateProviderStartup(
  provider: CliExecutionProvider,
  kind: CliProviderKind,
  commandOverride?: string,
): Promise<void> {
  if (kind === "fixture") {
    return;
  }
  const command =
    commandOverride ??
    (kind === "gemini" ? "gemini" : kind === "codex" ? "codex" : "claude");
  if (command.endsWith(".mjs") || command.endsWith(".js")) {
    return;
  }
  try {
    await probeBinary(command, ["--version"]);
  } catch {
    try {
      await probeBinary(command, ["--help"]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown probe failure.";
      throw new Error(
        `CLI provider "${kind}" is configured but binary "${command}" is not reachable: ${message}`,
      );
    }
  }
}
