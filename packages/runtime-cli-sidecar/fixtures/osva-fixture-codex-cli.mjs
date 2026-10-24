#!/usr/bin/env node
/**
 * Hermetic Codex CLI stand-in emitting JSONL like `codex exec --json`.
 */

function parseArgs(argv) {
  let prompt = "";
  let scenario = "success";
  const flagsWithValue = new Set([
    "--sandbox",
    "--scenario",
    "--cd",
    "--output-schema",
    "-o",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "exec") {
      continue;
    }
    if (flagsWithValue.has(arg)) {
      if (arg === "--scenario" && argv[i + 1] !== undefined) {
        scenario = argv[i + 1];
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    prompt = arg;
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

function emit(event) {
  console.log(JSON.stringify(event));
}

async function main() {
  switch (scenario) {
    case "success":
      emit({ type: "thread.started", thread_id: "fixture-thread" });
      emit({ type: "turn.started" });
      emit({
        type: "item.completed",
        item: {
          id: "item_1",
          type: "agent_message",
          text: "codex-fixture-ok",
        },
      });
      emit({
        type: "turn.completed",
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      return;
    case "multi-event":
      emit({ type: "turn.started" });
      emit({
        type: "item.completed",
        item: { id: "i1", type: "command_execution", command: "ls" },
      });
      emit({
        type: "item.completed",
        item: {
          id: "i2",
          type: "agent_message",
          text: "first-pass",
        },
      });
      emit({
        type: "item.completed",
        item: {
          id: "i3",
          type: "agent_message",
          text: "final-answer",
        },
      });
      emit({ type: "turn.completed", usage: {} });
      return;
    case "partial-chunks":
      process.stdout.write('{"type":"turn.started"}\n{"type":"item.completed","item":{"id":"x","type":"agent_message","text":"part');
      await sleep(50);
      process.stdout.write('-ial"}}\n');
      emit({ type: "turn.completed", usage: {} });
      return;
    case "error-event":
      emit({ type: "turn.started" });
      emit({ type: "error", message: "sandbox violation" });
      process.exitCode = 1;
      return;
    case "turn-failed":
      emit({ type: "turn.started" });
      emit({ type: "turn.failed", message: "turn failed" });
      process.exitCode = 1;
      return;
    case "missing-terminal":
      emit({ type: "turn.started" });
      emit({
        type: "item.completed",
        item: { id: "i1", type: "command_execution", command: "echo hi" },
      });
      return;
    case "malformed-line":
      emit({ type: "turn.started" });
      console.log("{{not json");
      emit({
        type: "item.completed",
        item: { id: "i2", type: "agent_message", text: "after-bad-line" },
      });
      return;
    case "slow":
      await sleep(1500);
      emit({
        type: "item.completed",
        item: { id: "i1", type: "agent_message", text: "slow-ok" },
      });
      return;
    case "hang":
      await sleep(3_600_000);
      return;
    case "fail-exit":
      console.error("codex fixture failure");
      process.exitCode = 2;
      return;
    case "large-stream":
      emit({ type: "turn.started" });
      for (let i = 0; i < 200; i += 1) {
        emit({
          type: "item.completed",
          item: {
            id: `i${i}`,
            type: "agent_message",
            text: "x".repeat(1024),
          },
        });
      }
      emit({
        type: "item.completed",
        item: { id: "final", type: "agent_message", text: "done" },
      });
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
