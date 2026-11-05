#!/usr/bin/env node
import assert from "node:assert/strict";

import { waitForNpmVersion } from "./wait-for-npm-version.mjs";

async function testSuccessAfterDelay() {
  let calls = 0;
  let clock = 0;
  const result = await waitForNpmVersion(
    "@osva-ai/adapter-artifact-azure",
    "0.1.2",
    {
      timeoutMs: 30_000,
      intervalMs: 10,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      query: () => {
        calls += 1;
        return calls < 3 ? null : "0.1.2";
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.version, "0.1.2");
  assert.equal(calls, 3);
}

async function testTimeoutDiagnostics() {
  let clock = 0;
  const result = await waitForNpmVersion(
    "@osva-ai/adapter-artifact-azure",
    "0.1.2",
    {
      timeoutMs: 25,
      intervalMs: 10,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      query: () => null,
    },
  );
  assert.equal(result.ok, false);
  assert.ok(result.attempts >= 1);
  assert.equal(result.lastObserved, null);
  assert.ok(clock >= 10);
}

async function testWrongVersionWaitsUntilTimeout() {
  let clock = 0;
  const result = await waitForNpmVersion(
    "@osva-ai/adapter-artifact-memory",
    "0.1.2",
    {
      timeoutMs: 15,
      intervalMs: 5,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      query: () => "0.1.1",
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.lastObserved, "0.1.1");
}

await testSuccessAfterDelay();
await testTimeoutDiagnostics();
await testWrongVersionWaitsUntilTimeout();

console.log("wait-for-npm-version.test.mjs passed");
