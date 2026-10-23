import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";

import { BlobServiceClient } from "@azure/storage-blob";

import {
  AzureArtifactBlobStore,
  createAzureArtifactBlobStoreFromClient,
} from "../src/azure-artifact-blob-store.js";
import { AZURE_ARTIFACT_ENV } from "../src/config.js";
import { expectedSha256, readAll, streamFromParts } from "./helpers.js";

const INTEGRATION_ENABLED = process.env.OSVA_ARTIFACT_AZURE_INTEGRATION === "1";

const AZURITE_CONNECTION_STRING =
  process.env[AZURE_ARTIFACT_ENV.CONNECTION_STRING] ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

describe.skipIf(!INTEGRATION_ENABLED)("Azurite integration", () => {
  let containerName: string;
  let blobServiceClient: BlobServiceClient;

  beforeAll(async () => {
    containerName = `osva-a12-${randomUUID().slice(0, 8)}`;
    blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURITE_CONNECTION_STRING,
    );
    await blobServiceClient.createContainer(containerName);
  });

  function createStore(): AzureArtifactBlobStore {
    return createAzureArtifactBlobStoreFromClient(
      blobServiceClient,
      containerName,
    );
  }

  it("two adapter instances share one container", async () => {
    const writer = createStore();
    const reader = createStore();
    const key = `workspace/ws/artifact/${randomUUID()}`;
    const body = Buffer.from("cross-instance-payload");

    await writer.write({
      key,
      content: streamFromParts([body]),
      maxBytes: 1024 * 1024,
    });

    const handle = await reader.open(key);
    expect(handle.sizeBytes).toBe(body.length);
    expect(await readAll(handle.stream)).toEqual(body);
    await writer.delete(key);
  });

  it("binary multichunk roundtrip", async () => {
    const store = createStore();
    const parts = [Buffer.from([0, 1, 2]), Buffer.from([255, 254])];
    const body = Buffer.concat(parts);
    const key = `v1/multichunk/${randomUUID()}`;

    const written = await store.write({
      key,
      content: streamFromParts(parts),
      maxBytes: 1024 * 1024,
    });
    expect(written.digest).toBe(expectedSha256(body));

    const handle = await store.open(key);
    expect(await readAll(handle.stream)).toEqual(body);
    await store.delete(key);
  });

  it("overwrite, missing open, and repeated delete", async () => {
    const store = createStore();
    const key = `v1/lifecycle/${randomUUID()}`;

    await store.write({
      key,
      content: streamFromParts([Buffer.from("first")]),
      maxBytes: 1024,
    });
    await store.write({
      key,
      content: streamFromParts([Buffer.from("second")]),
      maxBytes: 1024,
    });
    expect(await readAll((await store.open(key)).stream)).toEqual(
      Buffer.from("second"),
    );

    await store.delete(key);
    await store.delete(key);
    await expect(store.open(key)).rejects.toMatchObject({
      code: "ARTIFACT_UNAVAILABLE",
    });
  });
});
