#!/usr/bin/env node
/**
 * Hermetic Claude Code CLI stand-in for sidecar tests.
 */

function parseArgs(argv) {
  let prompt = "";
  let scenario = "success";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-p" || arg === "--print") {
      prompt = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--scenario" && argv[i + 1] !== undefined) {
      scenario = argv[i + 1];
      i += 1;
    }
  }
  const marker = prompt.match(/^__osva_scenario=([a-z0-9_-]+)__/);
  if (marker) {
    scenario = marker[1];
  }
  return { scenario };
}

const { scenario } = parseArgs(process.argv.slice(2));

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  switch (scenario) {
    case "success":
      console.log(
        JSON.stringify({
          result: "claude-fixture-ok",
          session_id: "fixture-session",
          total_cost_usd: 0.001,
        }),
      );
      return;
    case "structured":
      console.log(
        JSON.stringify({
          result: "",
          structured_output: { functions: ["main", "test"] },
          session_id: "fixture-session",
        }),
      );
      return;
    case "provider-error":
      console.log(
        JSON.stringify({
          is_error: true,
          result: "authentication failed",
          error: "authentication_failed",
        }),
      );
      process.exitCode = 1;
      return;
    case "permission-denied":
      console.log(
        JSON.stringify({
          is_error: true,
          result: "Permission denied for Edit tool",
        }),
      );
      process.exitCode = 1;
      return;
    case "malformed-json":
      console.log("not-json{{{");
      return;
    case "missing-result":
      console.log(JSON.stringify({ session_id: "x" }));
      return;
    case "slow":
      await sleep(1500);
      console.log(JSON.stringify({ result: "slow-ok" }));
      return;
    case "hang":
      await sleep(3_600_000);
      return;
    case "fail-exit":
      console.error("claude fixture stderr");
      process.exitCode = 1;
      return;
    case "large-output": {
      const blob = "y".repeat(128 * 1024);
      console.log(JSON.stringify({ result: blob }));
      return;
    }
    default:
      console.error(`unknown scenario: ${scenario}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
