import { spawnSync } from "node:child_process";

/** Best-effort termination of a child process and its descendants. */
export function killProcessTree(pid: number | undefined): void {
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
      // Already exited.
    }
  }
}
