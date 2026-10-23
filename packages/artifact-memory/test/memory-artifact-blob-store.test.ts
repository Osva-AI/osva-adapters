import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_ERROR_CODES,
  ARTIFACT_STORAGE_DRIVER_REGISTERED,
  type RegisteredArtifactBlobStoreModule,
} from "@osva-ai/contracts";

import {
  ArtifactBlobStoreError,
  MemoryArtifactBlobStore,
  createArtifactBlobStore,
  registeredArtifactBlobStoreModule,
} from "../src/index.js";
import { expectedSha256, readAll, streamFromParts } from "./helpers.js";

describe("MemoryArtifactBlobStore", () => {
  it("write/open/delete roundtrip", async () => {
    const store = new MemoryArtifactBlobStore();
    const body = Buffer.from("roundtrip-payload");
    const key = "workspace/ws/artifact/a1";

    const written = await store.write({
      key,
      content: streamFromParts([body]),
      maxBytes: 4096,
    });
    expect(written.sizeBytes).toBe(body.length);
    expect(written.digest).toBe(expectedSha256(body));

    const handle = await store.open(key);
    expect(handle.sizeBytes).toBe(body.length);
    expect(await readAll(handle.stream)).toEqual(body);

    await store.delete(key);
    await expect(store.open(key)).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    });
  });

  it("supports zero-byte content", async () => {
    const store = new MemoryArtifactBlobStore();
    const key = "workspace/ws/artifact/empty";
    const written = await store.write({
      key,
      content: streamFromParts([]),
      maxBytes: 16,
    });
    expect(written.sizeBytes).toBe(0);
    expect(written.digest).toBe(
      `sha256:${createHash("sha256").update(Buffer.alloc(0)).digest("hex")}`,
    );
    const handle = await store.open(key);
    expect(await readAll(handle.stream)).toEqual(Buffer.alloc(0));
  });

  it("preserves binary content", async () => {
    const store = new MemoryArtifactBlobStore();
    const body = Buffer.from([0, 1, 2, 255]);
    await store.write({
      key: "v1/binary",
      content: streamFromParts([body]),
      maxBytes: 1024,
    });
    const handle = await store.open("v1/binary");
    expect(await readAll(handle.stream)).toEqual(body);
  });

  it("streams multichunk input", async () => {
    const store = new MemoryArtifactBlobStore();
    const parts = [Buffer.from("hello-"), Buffer.from("world")];
    const body = Buffer.concat(parts);
    await store.write({
      key: "v1/multichunk",
      content: streamFromParts(parts),
      maxBytes: 1024,
    });
    const handle = await store.open("v1/multichunk");
    expect(await readAll(handle.stream)).toEqual(body);
  });

  it("computes sha256 digest with prefix", async () => {
    const store = new MemoryArtifactBlobStore();
    const body = Buffer.from("digest-me");
    const result = await store.write({
      key: "v1/digest",
      content: streamFromParts([body]),
      maxBytes: 1024,
    });
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.digest).toBe(expectedSha256(body));
  });

  it("rejects expectedDigest mismatch", async () => {
    const store = new MemoryArtifactBlobStore();
    await expect(
      store.write({
        key: "v1/mismatch",
        content: streamFromParts([Buffer.from("abc")]),
        maxBytes: 1024,
        expectedDigest: `sha256:${"b".repeat(64)}`,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ArtifactBlobStoreError &&
        error.code === ARTIFACT_ERROR_CODES.ARTIFACT_DIGEST_MISMATCH,
    );
    await expect(store.open("v1/mismatch")).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    });
  });

  it("enforces maxBytes while consuming the stream", async () => {
    const store = new MemoryArtifactBlobStore();
    const key = "v1/too-large";
    await expect(
      store.write({
        key,
        content: streamFromParts([
          Buffer.alloc(8),
          Buffer.alloc(8),
          Buffer.alloc(8),
        ]),
        maxBytes: 16,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ArtifactBlobStoreError &&
        error.code === ARTIFACT_ERROR_CODES.ARTIFACT_PAYLOAD_TOO_LARGE,
    );
    await expect(store.open(key)).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    });
  });

  it("replaces duplicate keys", async () => {
    const store = new MemoryArtifactBlobStore();
    const key = "v1/replace";
    await store.write({
      key,
      content: streamFromParts([Buffer.from("first")]),
      maxBytes: 1024,
    });
    await store.write({
      key,
      content: streamFromParts([Buffer.from("second-version")]),
      maxBytes: 1024,
    });
    const handle = await store.open(key);
    expect(await readAll(handle.stream)).toEqual(Buffer.from("second-version"));
  });

  it("delete is idempotent for missing keys", async () => {
    const store = new MemoryArtifactBlobStore();
    await expect(store.delete("v1/missing")).resolves.toBeUndefined();
    await expect(store.delete("v1/missing")).resolves.toBeUndefined();
  });

  it("returns isolated read buffers", async () => {
    const store = new MemoryArtifactBlobStore();
    const key = "v1/isolated";
    const original = Buffer.from("immutable");
    await store.write({
      key,
      content: streamFromParts([original]),
      maxBytes: 1024,
    });

    const first = await store.open(key);
    const firstBody = await readAll(first.stream);
    firstBody[0] = 0x00;

    const second = await store.open(key);
    expect(await readAll(second.stream)).toEqual(Buffer.from("immutable"));
  });

  it("exposes independent read streams", async () => {
    const store = new MemoryArtifactBlobStore();
    const key = "v1/streams";
    await store.write({
      key,
      content: streamFromParts([Buffer.from("stream-a")]),
      maxBytes: 1024,
    });
    const a = await store.open(key);
    const b = await store.open(key);
    expect(await readAll(a.stream)).toEqual(Buffer.from("stream-a"));
    expect(await readAll(b.stream)).toEqual(Buffer.from("stream-a"));
  });

  it("rejects malformed blob keys", async () => {
    const store = new MemoryArtifactBlobStore();
    await expect(
      store.write({
        key: "../escape",
        content: streamFromParts([Buffer.from("x")]),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_INVALID_REQUEST,
    });
  });

  it("registration factory satisfies RegisteredArtifactBlobStoreModule", async () => {
    const moduleShape =
      registeredArtifactBlobStoreModule as RegisteredArtifactBlobStoreModule;
    const store = await Promise.resolve(
      moduleShape.createArtifactBlobStore({
        driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
        maxBytes: 2048,
        registerModule: "file:///example.js",
      }),
    );
    const key = "workspace/ws/artifact/reg";
    const body = Buffer.from("registered-factory");
    await store.write({
      key,
      content: streamFromParts([body]),
      maxBytes: 2048,
    });
    const handle = await store.open(key);
    expect(await readAll(handle.stream)).toEqual(body);
  });

  it("createArtifactBlobStore export matches default module", () => {
    const fromNamed = createArtifactBlobStore({
      driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
      maxBytes: 1,
      registerModule: "file:///x.js",
    });
    expect(fromNamed).toBeInstanceOf(MemoryArtifactBlobStore);
  });
});
