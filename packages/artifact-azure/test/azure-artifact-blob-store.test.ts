import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_ERROR_CODES,
  ARTIFACT_STORAGE_DRIVER_REGISTERED,
  type RegisteredArtifactBlobStoreModule,
} from "@osva-ai/contracts";

import {
  AzureArtifactBlobStore,
  createArtifactBlobStore,
} from "../src/azure-artifact-blob-store.js";
import registeredArtifactBlobStoreModule from "../src/azure-artifact-blob-store.js";
import { AZURE_ARTIFACT_ENV } from "../src/config.js";
import { ArtifactBlobStoreError } from "../src/errors.js";
import { uploadBufferSizeBytes } from "../src/stream-digest.js";
import { sanitizeExternalMessage } from "../src/sanitize.js";
import { createFakeAzureContainer } from "./fake-azure-blob.js";
import { expectedSha256, readAll, streamFromParts } from "./helpers.js";

function storeFromFake(
  options: Parameters<typeof createFakeAzureContainer>[0] = {},
  storeOptions: { registeredMaxBytes?: number } = {},
): {
  store: AzureArtifactBlobStore;
  blobs: Map<string, Buffer>;
} {
  const { container, blobs } = createFakeAzureContainer(options);
  return {
    store: new AzureArtifactBlobStore({
      containerClient: container,
      registeredMaxBytes: storeOptions.registeredMaxBytes,
    }),
    blobs,
  };
}

describe("AzureArtifactBlobStore (mocked Azure client)", () => {
  it("write/open/delete roundtrip", async () => {
    const { store } = storeFromFake();
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
    const { store } = storeFromFake();
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

  it("preserves binary content and multichunk input", async () => {
    const { store } = storeFromFake();
    const parts = [Buffer.from([0, 1, 2]), Buffer.from([255])];
    const body = Buffer.concat(parts);
    await store.write({
      key: "v1/binary-multichunk",
      content: streamFromParts(parts),
      maxBytes: 1024,
    });
    const handle = await store.open("v1/binary-multichunk");
    expect(await readAll(handle.stream)).toEqual(body);
  });

  it("rejects expectedDigest mismatch without promoting partial blob", async () => {
    const { store, blobs } = storeFromFake();
    const key = "v1/mismatch";
    await expect(
      store.write({
        key,
        content: streamFromParts([Buffer.from("abc")]),
        maxBytes: 1024,
        expectedDigest: `sha256:${"b".repeat(64)}`,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ArtifactBlobStoreError &&
        error.code === ARTIFACT_ERROR_CODES.ARTIFACT_DIGEST_MISMATCH,
    );
    expect([...blobs.keys()].some((name) => name.startsWith(key))).toBe(false);
    await expect(store.open(key)).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    });
  });

  it("enforces maxBytes while consuming the stream", async () => {
    const { store } = storeFromFake();
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
    ).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_PAYLOAD_TOO_LARGE,
    });
    await expect(store.open(key)).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    });
  });

  it("enforces registered config maxBytes when lower than request maxBytes", async () => {
    const { store } = storeFromFake({}, { registeredMaxBytes: 16 });
    await expect(
      store.write({
        key: "v1/config-cap",
        content: streamFromParts([
          Buffer.alloc(8),
          Buffer.alloc(8),
          Buffer.alloc(8),
        ]),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_PAYLOAD_TOO_LARGE,
    });
  });

  it("preserves a committed object when copy to destination fails", async () => {
    const key = "v1/copy-fail";
    let copyAttempts = 0;
    const { store } = storeFromFake({
      onBeginCopyFromURL: async () => {
        copyAttempts += 1;
        if (copyAttempts > 1) {
          return { copyStatus: "failed" };
        }
        return { copyStatus: "success" };
      },
    });

    await store.write({
      key,
      content: streamFromParts([Buffer.from("committed-first")]),
      maxBytes: 1024,
    });
    await expect(
      store.write({
        key,
        content: streamFromParts([Buffer.from("never-committed")]),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_INVALID_REQUEST,
    });

    const handle = await store.open(key);
    expect(await readAll(handle.stream)).toEqual(
      Buffer.from("committed-first"),
    );
  });

  it("rejects copy operations that report non-success status", async () => {
    const { store } = storeFromFake({
      onBeginCopyFromURL: async () => ({ copyStatus: "failed" }),
    });
    await expect(
      store.write({
        key: "v1/copy-status-failed",
        content: streamFromParts([Buffer.from("payload")]),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_INVALID_REQUEST,
    });
  });

  it("cleans only this writer staging blob, not destination or other staging keys", async () => {
    const deleted: string[] = [];
    const { store, blobs } = storeFromFake({
      onDelete: (blobName) => {
        deleted.push(blobName);
      },
    });
    blobs.set(
      "v1/other-writer.__osva_pending.other-id",
      Buffer.from("foreign"),
    );

    await store.write({
      key: "v1/isolated-staging",
      content: streamFromParts([Buffer.from("payload")]),
      maxBytes: 1024,
    });

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatch(/^v1\/isolated-staging\.__osva_pending\./);
    expect(blobs.has("v1/isolated-staging")).toBe(true);
    expect(blobs.has("v1/other-writer.__osva_pending.other-id")).toBe(true);
    expect(
      [...blobs.keys()].some((name) => name.includes(".__osva_pending.")),
    ).toBe(true);
  });

  it("uses bounded upload buffer size for streaming uploads", async () => {
    let observedBufferSize: number | undefined;
    const { container, blobs } = createFakeAzureContainer({
      onUploadStream: async (blobName, stream, bufferSize) => {
        observedBufferSize = bufferSize;
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Uint8Array>) {
          chunks.push(Buffer.from(chunk));
        }
        blobs.set(blobName, Buffer.concat(chunks));
      },
    });
    const store = new AzureArtifactBlobStore({ containerClient: container });
    await store.write({
      key: "v1/buffer",
      content: streamFromParts([Buffer.alloc(1024)]),
      maxBytes: 4096,
    });
    expect(observedBufferSize).toBe(uploadBufferSizeBytes());
  });

  it("concurrent writes to the same key leave one successful committed value", async () => {
    const { store } = storeFromFake();
    const key = "v1/concurrent";
    const results = await Promise.allSettled([
      store.write({
        key,
        content: streamFromParts([Buffer.from("writer-a")]),
        maxBytes: 1024,
      }),
      store.write({
        key,
        content: streamFromParts([Buffer.from("writer-b-longer")]),
        maxBytes: 1024,
      }),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    const body = await readAll((await store.open(key)).stream);
    expect(
      ["writer-a", "writer-b-longer"].some(
        (value) => Buffer.compare(body, Buffer.from(value)) === 0,
      ),
    ).toBe(true);
  });

  it("replaces duplicate keys", async () => {
    const { store } = storeFromFake();
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
    const { store } = storeFromFake();
    await expect(store.delete("v1/missing")).resolves.toBeUndefined();
    await expect(store.delete("v1/missing")).resolves.toBeUndefined();
  });

  it("cleans staging blobs after failed upload", async () => {
    const { store, blobs } = storeFromFake({
      onUploadStream: async (_name, stream) => {
        stream.resume();
        throw new Error("upload interrupted");
      },
    });
    await expect(
      store.write({
        key: "v1/fail-upload",
        content: streamFromParts([Buffer.from("data")]),
        maxBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(ArtifactBlobStoreError);
    expect([...blobs.keys()].some((k) => k.includes(".__osva_pending."))).toBe(
      false,
    );
  });

  it("sanitizes connection strings and SAS query parameters in error text", () => {
    const raw =
      "DefaultEndpointsProtocol=https;AccountName=x;AccountKey=secretvalue;EndpointSuffix=core.windows.net&sig=abc&se=123";
    const sanitized = sanitizeExternalMessage(raw);
    expect(sanitized).not.toContain("secretvalue");
    expect(sanitized).toContain("[redacted]");
  });

  it("does not expose secrets in Azure error messages", async () => {
    const secret = "super-secret-account-key-value";
    const { RestError } = await import("@azure/storage-blob");
    const { container } = createFakeAzureContainer({
      onUploadStream: async () => {
        throw new RestError(`Authorization failed AccountKey=${secret}`, {
          statusCode: 403,
        });
      },
    });
    const store = new AzureArtifactBlobStore({ containerClient: container });
    await expect(
      store.write({
        key: "v1/secret",
        content: streamFromParts([Buffer.from("x")]),
        maxBytes: 1024,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof ArtifactBlobStoreError)) {
        return false;
      }
      expect(error.message).not.toContain(secret);
      expect(error.message).toContain("[redacted]");
      return true;
    });
  });

  it("surfaces interrupted read failures", async () => {
    const { store } = storeFromFake({
      onDownload: async () => {
        throw new Error("read interrupted");
      },
    });
    await store.write({
      key: "v1/read-fail",
      content: streamFromParts([Buffer.from("payload")]),
      maxBytes: 1024,
    });
    await expect(store.open("v1/read-fail")).rejects.toMatchObject({
      code: ARTIFACT_ERROR_CODES.ARTIFACT_INVALID_REQUEST,
    });
  });

  it("rejects malformed blob keys", async () => {
    const { store } = storeFromFake();
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

  it("registration factory requires Azure environment configuration", () => {
    withEnv(
      {
        [AZURE_ARTIFACT_ENV.CONTAINER]: undefined,
        [AZURE_ARTIFACT_ENV.CONNECTION_STRING]: undefined,
        [AZURE_ARTIFACT_ENV.ACCOUNT_NAME]: undefined,
        [AZURE_ARTIFACT_ENV.ACCOUNT_KEY]: undefined,
      },
      () => {
        expect(() =>
          createArtifactBlobStore({
            driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
            maxBytes: 2048,
            registerModule: "file:///example.js",
          }),
        ).toThrow(ArtifactBlobStoreError);
      },
    );
  });

  it("registration factory satisfies RegisteredArtifactBlobStoreModule", async () => {
    withEnv(
      {
        [AZURE_ARTIFACT_ENV.CONTAINER]: "test-container",
        [AZURE_ARTIFACT_ENV.CONNECTION_STRING]:
          "DefaultEndpointsProtocol=https;AccountName=fake;AccountKey=ZmFrZWZhYmMxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MA==;EndpointSuffix=core.windows.net",
        [AZURE_ARTIFACT_ENV.ACCOUNT_NAME]: undefined,
        [AZURE_ARTIFACT_ENV.ACCOUNT_KEY]: undefined,
      },
      async () => {
        const moduleShape =
          registeredArtifactBlobStoreModule as RegisteredArtifactBlobStoreModule;
        const store = await Promise.resolve(
          moduleShape.createArtifactBlobStore({
            driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
            maxBytes: 2048,
            registerModule: "file:///example.js",
          }),
        );
        expect(store).toBeInstanceOf(AzureArtifactBlobStore);
      },
    );
  });
});

describe("createArtifactBlobStore configuration guardrails", () => {
  it("rejects missing credentials", () => {
    withEnv(
      {
        [AZURE_ARTIFACT_ENV.CONTAINER]: "artifacts",
        [AZURE_ARTIFACT_ENV.CONNECTION_STRING]: undefined,
        [AZURE_ARTIFACT_ENV.ACCOUNT_NAME]: undefined,
        [AZURE_ARTIFACT_ENV.ACCOUNT_KEY]: undefined,
      },
      () => {
        expect(() =>
          createArtifactBlobStore({
            driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
            maxBytes: 1,
            registerModule: "unused",
          }),
        ).toThrow(/credentials are required/i);
      },
    );
  });

  it("rejects mixing connection string and shared key env vars", () => {
    withEnv(
      {
        [AZURE_ARTIFACT_ENV.CONTAINER]: "artifacts",
        [AZURE_ARTIFACT_ENV.CONNECTION_STRING]: "UseDevelopmentStorage=true",
        [AZURE_ARTIFACT_ENV.ACCOUNT_NAME]: "account",
        [AZURE_ARTIFACT_ENV.ACCOUNT_KEY]: undefined,
      },
      () => {
        expect(() =>
          createArtifactBlobStore({
            driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
            maxBytes: 1,
            registerModule: "unused",
          }),
        ).toThrow(/not both/i);
      },
    );
  });
});

function withEnv(
  overrides: Record<string, string | undefined>,
  run: () => void | Promise<void>,
): void | Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
