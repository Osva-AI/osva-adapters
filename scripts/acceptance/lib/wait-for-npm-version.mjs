#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 5_000;

/**
 * @param {string} packageName
 * @param {string} versionSpec
 * @returns {string | null}
 */
export function queryNpmVersion(packageName, versionSpec) {
  try {
    const raw = execFileSync(
      "npm",
      ["view", `${packageName}@${versionSpec}`, "version", "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!raw) {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.replace(/^"|"$/g, "");
    }
    if (typeof parsed === "string" && parsed.length > 0) {
      return parsed;
    }
    return null;
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr ?? "")
        : "";
    const code =
      error && typeof error === "object" && "status" in error
        ? error.status
        : undefined;
    if (code === 1 || /E404|404 Not Found|Not found/i.test(stderr)) {
      return null;
    }
    throw error;
  }
}

/**
 * @param {string} packageName
 * @param {string} expectedVersion
 * @param {{
 *   timeoutMs?: number;
 *   intervalMs?: number;
 *   query?: typeof queryNpmVersion;
 *   sleep?: (ms: number) => Promise<void>;
 *   now?: () => number;
 * }} [options]
 */
export async function waitForNpmVersion(
  packageName,
  expectedVersion,
  options = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const query = options.query ?? queryNpmVersion;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());

  const deadline = now() + timeoutMs;
  let attempts = 0;
  let lastObserved = null;
  let lastError = null;

  while (now() < deadline) {
    attempts += 1;
    try {
      lastObserved = query(packageName, expectedVersion);
      if (lastObserved === expectedVersion) {
        return { ok: true, attempts, version: lastObserved };
      }
    } catch (error) {
      lastError = error;
    }
    if (now() + intervalMs > deadline) {
      break;
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    attempts,
    lastObserved,
    lastError,
    timeoutMs,
    intervalMs,
  };
}

function printUsage() {
  console.error(
    "Usage: wait-for-npm-version.mjs <package> <expected-version> [--timeout-ms=180000] [--interval-ms=5000]",
  );
}

function parseArgs(argv) {
  if (argv.length < 2) {
    return { error: "missing package or version" };
  }
  const packageName = argv[0];
  const expectedVersion = argv[1];
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let intervalMs = DEFAULT_INTERVAL_MS;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg.startsWith("--interval-ms=")) {
      intervalMs = Number(arg.slice("--interval-ms=".length));
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { error: "invalid --timeout-ms" };
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { error: "invalid --interval-ms" };
  }
  return { packageName, expectedVersion, timeoutMs, intervalMs };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    printUsage();
    console.error(parsed.error);
    process.exit(2);
  }

  const { packageName, expectedVersion, timeoutMs, intervalMs } = parsed;
  console.log(
    `Waiting up to ${timeoutMs}ms for ${packageName}@${expectedVersion} on the public npm registry (poll every ${intervalMs}ms)...`,
  );

  const result = await waitForNpmVersion(packageName, expectedVersion, {
    timeoutMs,
    intervalMs,
  });

  if (result.ok) {
    console.log(
      `Registry visibility confirmed: ${packageName}@${result.version} (after ${result.attempts} attempt(s)).`,
    );
    process.exit(0);
  }

  console.error(
    `Timed out after ${result.attempts} attempt(s) over ${timeoutMs}ms waiting for ${packageName}@${expectedVersion}.`,
  );
  if (result.lastObserved != null) {
    console.error(
      `Last npm view version for ${packageName}@${expectedVersion}: ${result.lastObserved} (expected exact match).`,
    );
  } else {
    console.error(
      `npm view ${packageName}@${expectedVersion} version still unavailable (404 or empty).`,
    );
  }
  if (result.lastError instanceof Error) {
    console.error(`Last query error: ${result.lastError.message}`);
  }
  console.error(
    "Publication may still have succeeded; re-run npm view manually. This workflow does not retry npm publish.",
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
