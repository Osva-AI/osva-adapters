#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  blobListUrlFromConnectionString,
  probeAzuriteBlobReady,
} from "./azurite-readiness.mjs";

const cs =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=secret;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

const url = blobListUrlFromConnectionString(cs);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "10000");
assert.equal(url.pathname, "/devstoreaccount1");
assert.equal(url.searchParams.get("comp"), "list");

assert.throws(() => blobListUrlFromConnectionString("AccountName=x"), {
  message: /BlobEndpoint/,
});

let fetchCalls = 0;
globalThis.fetch = async (input) => {
  fetchCalls += 1;
  const href = typeof input === "string" ? input : input.href;
  assert.match(href, /comp=list/);
  return new Response("", { status: 200 });
};

assert.equal(await probeAzuriteBlobReady(cs), true);
assert.equal(fetchCalls, 1);

globalThis.fetch = async () => new Response("", { status: 503 });
assert.equal(await probeAzuriteBlobReady(url), false);

console.log("azurite-readiness.test.mjs passed");
