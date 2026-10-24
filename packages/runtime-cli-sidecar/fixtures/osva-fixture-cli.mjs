#!/usr/bin/env node
/**
 * Deterministic CLI fixture for A2.1 acceptance (no vendor credentials).
 * Invoked with explicit argument arrays only — never via shell interpolation.
 */
import { spawn } from "node:child_process";

function parseArgs(argv) {
  let scenario = "success";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario" && argv[i + 1] !== undefined) {
      scenario = argv[i + 1];
      i += 1;
    }
  }
  return scenario;
}

const scenario = parseArgs(process.argv.slice(2));

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  switch (scenario) {
    case "success":
      console.log(JSON.stringify({ ok: true, scenario, pid: process.pid }));
      return;
    case "fail":
      console.error("fixture intentional failure");
      process.exitCode = 2;
      return;
    case "invalid-json":
      console.log("not-json{{{");
      return;
    case "slow":
      await sleep(1500);
      console.log(JSON.stringify({ ok: true, scenario: "slow" }));
      return;
    case "hang":
      await sleep(3_600_000);
      return;
    case "large-output": {
      const chunk = "x".repeat(64 * 1024);
      console.log(JSON.stringify({ ok: true, blob: chunk }));
      return;
    }
    case "spawn-child": {
      const child = spawn(process.execPath, ["-e", "console.log('child')"], {
        stdio: "inherit",
        shell: false,
      });
      await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`child exit ${String(code)}`));
          }
        });
      });
      console.log(JSON.stringify({ ok: true, scenario: "spawn-child" }));
      return;
    }
    case "spawn-failure":
      spawn("__osva_nonexistent_binary__", [], { shell: false });
      return;
    default:
      console.error(`unknown scenario: ${scenario}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
