#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

/**
 * Terminate a process and its descendants (best-effort, cross-platform).
 * @param {number | undefined} pid
 */
export function killProcessTree(pid) {
  if (pid === undefined || pid <= 0) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may already have exited.
    }
  }
}

function defaultUseShell(command) {
  return (
    process.platform === "win32" &&
    (command === "pnpm" ||
      command === "npm" ||
      command === "npx" ||
      command === "docker")
  );
}

/**
 * Run a subprocess with a wall-clock deadline. Rejects on nonzero exit or timeout.
 * Child trees are killed on timeout (Windows: taskkill /T; Unix: process group).
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   cwd?: string;
 *   env?: NodeJS.ProcessEnv;
 *   stdio?: import("node:child_process").StdioOptions;
 *   timeoutMs: number;
 *   label?: string;
 *   shell?: boolean;
 * }} options
 * @returns {Promise<void>}
 */
export function runWithDeadline(command, args, options) {
  const timeoutMs = options.timeoutMs;
  const label = options.label ?? `${command} ${args.join(" ")}`;
  const useShell = options.shell ?? defaultUseShell(command);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    /** @type {import("node:child_process").ChildProcess | undefined} */
    let child;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      const elapsedMs = Date.now() - startedAt;
      if (child?.pid !== undefined) {
        killProcessTree(child.pid);
      }
      reject(
        new Error(
          `${label} exceeded deadline of ${String(timeoutMs)}ms (elapsed ${String(elapsedMs)}ms); child process tree was terminated`,
        ),
      );
    }, timeoutMs);

    child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? "inherit",
      shell: useShell,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(error);
      }
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      if (code !== 0) {
        reject(
          new Error(
            `${label} failed after ${String(elapsedMs)}ms (exit ${String(code)}, signal ${String(signal)})`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

/** Wall-clock budget for A1.1 external npm consumer (registry pack + install). */
export const PACK_CONSUMER_DEADLINE_MS = 300_000;

/** Wall-clock budget for A1.2 (Docker Azurite + nested npm install + smoke). */
export const AZURE_PACK_CONSUMER_DEADLINE_MS = 600_000;
