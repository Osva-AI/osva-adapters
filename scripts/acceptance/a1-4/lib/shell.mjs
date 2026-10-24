#!/usr/bin/env node
import { spawnSync } from "node:child_process";

export function run(command, args, options = {}) {
  const useShell =
    process.platform === "win32" &&
    (command === "pnpm" ||
      command === "npm" ||
      command === "npx" ||
      command === "docker");
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.stdio ?? "inherit",
    shell: useShell,
    env: { ...process.env, ...options.env },
    encoding: options.encoding,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (exit ${String(result.status)})`,
    );
  }
  return result;
}

export function runCapture(command, args, options = {}) {
  const result = run(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
