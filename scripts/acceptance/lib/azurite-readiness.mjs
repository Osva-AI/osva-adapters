#!/usr/bin/env node
/**
 * Poll Azurite blob endpoint until list containers succeeds (HTTP < 500).
 */

/**
 * @param {string} connectionString
 * @returns {URL}
 */
export function blobListUrlFromConnectionString(connectionString) {
  const match = connectionString.match(/BlobEndpoint=([^;]+)/i);
  if (!match) {
    throw new Error("Connection string missing BlobEndpoint=");
  }
  const base = match[1].replace(/\/$/, "");
  return new URL(`${base}?comp=list`);
}

/**
 * @param {string | URL} target
 * @returns {Promise<boolean>}
 */
export async function probeAzuriteBlobReady(target) {
  const url =
    typeof target === "string" && target.includes("BlobEndpoint=")
      ? blobListUrlFromConnectionString(target)
      : new URL(target);
  const response = await fetch(url, { method: "GET" });
  return response.status < 500;
}

/**
 * @param {string | URL} target
 * @param {{ timeoutMs?: number; intervalMs?: number; label?: string }} [options]
 */
export async function waitForAzuriteBlobReady(target, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const label = options.label ?? "Azurite blob endpoint";
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      if (await probeAzuriteBlobReady(target)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    `Timed out waiting for ${label}.${detail ? ` Last: ${detail}` : ""}`,
  );
}
