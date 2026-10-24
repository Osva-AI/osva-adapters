#!/usr/bin/env node
/**
 * Hermetic Gemini CLI stand-in for sidecar tests (no API calls).
 * Accepts a subset of real gemini argv: -p, --output-format json, --scenario (test hook).
 */

function parseArgs(argv) {
  let prompt = "";
  let scenario = "success";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-p" || arg === "--prompt") {
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
  return { prompt, scenario };
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
          response: "gemini-fixture-ok",
          stats: { inputTokens: 1, outputTokens: 2 },
        }),
      );
      return;
    case "api-error":
      console.log(
        JSON.stringify({
          error: { message: "API quota exceeded" },
        }),
      );
      return;
    case "empty-response":
      console.log(JSON.stringify({ response: "", stats: {} }));
      return;
    case "malformed-json":
      console.log("{ not json");
      return;
    case "missing-result":
      console.log(JSON.stringify({ stats: {} }));
      return;
    case "slow":
      await sleep(1500);
      console.log(JSON.stringify({ response: "slow-ok", stats: {} }));
      return;
    case "hang":
      await sleep(3_600_000);
      return;
    case "fail-exit":
      console.error("gemini fixture exit 1");
      process.exitCode = 1;
      return;
    case "auth-fail":
      console.error("Missing GEMINI_API_KEY");
      process.exitCode = 1;
      return;
    case "large-output": {
      const blob = "x".repeat(128 * 1024);
      console.log(JSON.stringify({ response: blob, stats: {} }));
      return;
    }
    default:
      console.error(`unknown scenario: ${scenario}`);
      process.exitCode = 42;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
