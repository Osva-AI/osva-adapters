import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { BlobServiceClient, RestError } from "@azure/storage-blob";
import {
  SHA256_INTEGRITY_PREFIX,
  isSha256IntegrityDigest,
  type ArtifactBlobReadHandle,
  type ArtifactBlobStore,
  type ArtifactBlobWriteInput,
  type ArtifactBlobWriteResult,
  type ArtifactStorageConfigRegistered,
  type RegisteredArtifactBlobStoreModule,
} from "@osva-ai/contracts";

import {
  type ResolvedAzureArtifactConfig,
  resolveAzureArtifactConfigFromEnv,
} from "./config.js";
import {
  ArtifactBlobStoreError,
  blobUnavailable,
  digestMismatch,
  invalidRequest,
} from "./errors.js";
import { sanitizeExternalMessage } from "./sanitize.js";
import {
  createDigestingReadable,
  uploadBufferSizeBytes,
} from "./stream-digest.js";

const SAFE_BLOB_KEY_PATTERN = /^[a-zA-Z0-9._/-]+$/;
const STAGING_SUFFIX = ".__osva_pending.";

export interface AzureCopyPollResult {
  readonly copyStatus?: string | undefined;
}

export interface AzureBlockBlobLike {
  readonly url: string;
  uploadStream(
    stream: NodeJS.ReadableStream,
    bufferSize: number,
    maxConcurrency: number,
    options?: unknown,
  ): Promise<unknown>;
  beginCopyFromURL(
    sourceUrl: string,
  ): Promise<{ pollUntilDone(): Promise<AzureCopyPollResult> }>;
  deleteIfExists(): Promise<unknown>;
  getProperties(): Promise<{ contentLength?: number | undefined }>;
  download(
    offset: number,
  ): Promise<{ readableStreamBody?: NodeJS.ReadableStream | undefined }>;
}

export interface AzureBlobContainerLike {
  getBlockBlobClient(blobName: string): AzureBlockBlobLike;
}

export interface AzureArtifactBlobStoreOptions {
  readonly containerClient: AzureBlobContainerLike;
  readonly registeredMaxBytes?: number | undefined;
}

export class AzureArtifactBlobStore implements ArtifactBlobStore {
  private readonly containerClient: AzureBlobContainerLike;
  private readonly registeredMaxBytes: number | undefined;

  constructor(options: AzureArtifactBlobStoreOptions) {
    this.containerClient = options.containerClient;
    this.registeredMaxBytes = options.registeredMaxBytes;
  }

  async write(input: ArtifactBlobWriteInput): Promise<ArtifactBlobWriteResult> {
    assertSafeBlobKey(input.key);
    const effectiveMaxBytes = resolveEffectiveMaxBytes(
      input.maxBytes,
      this.registeredMaxBytes,
    );
    assertWriteLimits(input, effectiveMaxBytes);

    const stagingKey = `${input.key}${STAGING_SUFFIX}${randomUUID()}`;
    const stagingClient = this.containerClient.getBlockBlobClient(stagingKey);

    const { stream, digestPromise } = createDigestingReadable(
      input.content,
      effectiveMaxBytes,
    );

    try {
      const { sizeBytes, digest } = await Promise.all([
        digestPromise,
        stagingClient.uploadStream(stream, uploadBufferSizeBytes(), 5, {
          blobHTTPHeaders: { blobContentType: "application/octet-stream" },
        }),
      ]).then(([digestResult]) => digestResult);

      if (
        input.expectedDigest !== undefined &&
        input.expectedDigest !== digest
      ) {
        throw digestMismatch();
      }

      const destination = this.containerClient.getBlockBlobClient(input.key);
      await copyBlobReplace(destination, stagingClient);
      return { sizeBytes, digest };
    } catch (error) {
      if (error instanceof ArtifactBlobStoreError) {
        throw error;
      }
      throw mapAzureError(error, input.key);
    } finally {
      try {
        await stagingClient.deleteIfExists();
      } catch {
        // Best-effort staging cleanup; do not mask the write error.
      }
    }
  }

  async open(key: string): Promise<ArtifactBlobReadHandle> {
    assertSafeBlobKey(key);
    const blobClient = this.containerClient.getBlockBlobClient(key);

    try {
      const properties = await blobClient.getProperties();
      const sizeBytes = properties.contentLength ?? 0;

      const download = await blobClient.download(0);
      const body = download.readableStreamBody;
      if (body === undefined) {
        throw blobUnavailable(key);
      }

      const nodeStream = Readable.from(body as AsyncIterable<Uint8Array>);
      return {
        sizeBytes,
        stream: nodeStream,
      };
    } catch (error) {
      if (error instanceof ArtifactBlobStoreError) {
        throw error;
      }
      throw mapAzureOpenError(error, key);
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeBlobKey(key);
    const blobClient = this.containerClient.getBlockBlobClient(key);
    try {
      await blobClient.deleteIfExists();
    } catch (error) {
      if (error instanceof ArtifactBlobStoreError) {
        throw error;
      }
      throw mapAzureError(error, key);
    }
  }
}

export function createAzureArtifactBlobStoreFromConfig(
  config: ResolvedAzureArtifactConfig,
  registeredMaxBytes?: number,
): AzureArtifactBlobStore {
  const containerClient = config.blobServiceClient.getContainerClient(
    config.containerName,
  );
  return new AzureArtifactBlobStore({ containerClient, registeredMaxBytes });
}

export function createAzureArtifactBlobStoreFromClient(
  blobServiceClient: BlobServiceClient,
  containerName: string,
  registeredMaxBytes?: number,
): AzureArtifactBlobStore {
  const containerClient: AzureBlobContainerLike =
    blobServiceClient.getContainerClient(containerName);
  return new AzureArtifactBlobStore({ containerClient, registeredMaxBytes });
}

export function createArtifactBlobStore(
  config: ArtifactStorageConfigRegistered,
): AzureArtifactBlobStore {
  const azureConfig = resolveAzureArtifactConfigFromEnv();
  return new AzureArtifactBlobStore({
    containerClient: azureConfig.blobServiceClient.getContainerClient(
      azureConfig.containerName,
    ),
    registeredMaxBytes: config.maxBytes,
  });
}

const moduleShape: RegisteredArtifactBlobStoreModule = {
  createArtifactBlobStore,
};

export default moduleShape;

async function copyBlobReplace(
  destination: AzureBlockBlobLike,
  source: AzureBlockBlobLike,
): Promise<void> {
  const copyPoller = await destination.beginCopyFromURL(source.url);
  const copyResult = await copyPoller.pollUntilDone();
  if (
    copyResult.copyStatus !== undefined &&
    copyResult.copyStatus !== "success"
  ) {
    throw invalidRequest("Azure Blob Storage copy to destination failed.");
  }
}

function resolveEffectiveMaxBytes(
  requestMaxBytes: number,
  registeredMaxBytes: number | undefined,
): number {
  if (registeredMaxBytes === undefined) {
    return requestMaxBytes;
  }
  return Math.min(requestMaxBytes, registeredMaxBytes);
}

function assertWriteLimits(
  input: ArtifactBlobWriteInput,
  effectiveMaxBytes: number,
): void {
  if (!Number.isFinite(effectiveMaxBytes) || effectiveMaxBytes < 0) {
    throw invalidRequest("maxBytes must be a non-negative finite number.");
  }

  if (
    input.expectedDigest !== undefined &&
    !isSha256IntegrityDigest(input.expectedDigest)
  ) {
    throw invalidRequest(
      `expectedDigest must use the ${SHA256_INTEGRITY_PREFIX} prefix with 64 hex digits.`,
    );
  }
}

function assertSafeBlobKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw invalidRequest("Blob key is required.");
  }

  if (
    !SAFE_BLOB_KEY_PATTERN.test(key) ||
    key.includes("..") ||
    key.includes(STAGING_SUFFIX)
  ) {
    throw invalidRequest("Blob key contains unsupported characters.");
  }
}

function mapAzureOpenError(
  error: unknown,
  key: string,
): ArtifactBlobStoreError {
  if (error instanceof RestError && error.statusCode === 404) {
    return blobUnavailable(key);
  }
  return mapAzureError(error, key);
}

function mapAzureError(error: unknown, key: string): ArtifactBlobStoreError {
  if (error instanceof RestError) {
    if (error.statusCode === 404) {
      return blobUnavailable(key);
    }
    return invalidRequest(
      sanitizeExternalMessage(
        error.message.length > 0
          ? error.message
          : "Azure Blob Storage request failed.",
      ),
    );
  }
  if (error instanceof Error) {
    return invalidRequest(sanitizeExternalMessage(error.message));
  }
  return invalidRequest("Azure Blob Storage request failed.");
}
