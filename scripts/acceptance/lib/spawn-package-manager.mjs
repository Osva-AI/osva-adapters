#!/usr/bin/env node
/**
 * Spawn npm/pnpm/npx with shell:false (avoids Node DEP0190 on Windows).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PACKAGE_MANAGER_NAMES = new Set(["npm", "pnpm", "npx"]);

function nodeModulesBin(name) {
  return path.join(path.dirname(process.execPath), "node_modules", name);
}

/**
 * @returns {{ command: string, args: string[] } | null}
 */
function resolveNodeCliInvocation(command, args, repoRoot) {
  if (command === "npm") {
    const npmCli = path.join(nodeModulesBin("npm"), "bin", "npm-cli.js");
    if (existsSync(npmCli)) {
      return { command: process.execPath, args: [npmCli, ...args] };
    }
  }
  if (command === "npx") {
    const npxCli = path.join(nodeModulesBin("npm"), "bin", "npx-cli.js");
    if (existsSync(npxCli)) {
      return { command: process.execPath, args: [npxCli, ...args] };
    }
  }
  if (command === "pnpm") {
    const corepackPnpm = path.join(
      nodeModulesBin("corepack"),
      "dist",
      "pnpm.js",
    );
    if (existsSync(corepackPnpm)) {
      return { command: process.execPath, args: [corepackPnpm, ...args] };
    }
    if (repoRoot !== undefined) {
      const localPnpm = path.join(
        repoRoot,
        "node_modules",
        "pnpm",
        "bin",
        "pnpm.cjs",
      );
      if (existsSync(localPnpm)) {
        return { command: process.execPath, args: [localPnpm, ...args] };
      }
    }
  }
  return null;
}

/**
 * Resolve Windows `.cmd` shims when Node CLI entrypoints are unavailable.
 * @param {string} command
 */
export function resolvePackageManagerCommand(command) {
  if (process.platform !== "win32") {
    return command;
  }
  if (!PACKAGE_MANAGER_NAMES.has(command)) {
    return command;
  }
  return `${command}.cmd`;
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ cwd?: string, stdio?: import("node:child_process").StdioOptions, env?: NodeJS.ProcessEnv, encoding?: BufferEncoding, repoRoot?: string }} [options]
 */
export function spawnCommand(command, args, options = {}) {
  const nodeInvocation = PACKAGE_MANAGER_NAMES.has(command)
    ? resolveNodeCliInvocation(command, args, options.repoRoot)
    : null;

  const executable = nodeInvocation?.command ?? command;
  const spawnArgs = nodeInvocation?.args ?? [...args];

  const resolvedExecutable =
    nodeInvocation === null && PACKAGE_MANAGER_NAMES.has(command)
      ? resolvePackageManagerCommand(command)
      : executable;

  const result = spawnSync(resolvedExecutable, spawnArgs, {
    cwd: options.cwd,
    stdio: options.stdio ?? "inherit",
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...options.env },
    ...(options.encoding !== undefined ? { encoding: options.encoding } : {}),
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${resolvedExecutable} ${spawnArgs.join(" ")} failed (exit ${String(result.status)})`,
    );
  }
  return result;
}
