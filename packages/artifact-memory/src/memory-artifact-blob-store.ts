import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  ARTIFACT_ERROR_CODES,
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
  ArtifactBlobStoreError,
  blobUnavailable,
  digestMismatch,
  invalidRequest,
  payloadTooLarge,
} from "./errors.js";

const SAFE_BLOB_KEY_PATTERN = /^[a-zA-Z0-9._/-]+$/;

interface StoredBlob {
  readonly body: Buffer;
  readonly sizeBytes: number;
  readonly digest: string;
}

/**
 * Process-local, non-durable artifact byte storage.
 *
 * Bytes are held in a single Node.js heap Map for the lifetime of the store
 * instance. This adapter is suitable for reference tests and single-process
 * development only — not for production durability or cross-process sharing.
 */
export class MemoryArtifactBlobStore implements ArtifactBlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  async write(input: ArtifactBlobWriteInput): Promise<ArtifactBlobWriteResult> {
    assertSafeBlobKey(input.key);
    assertWriteLimits(input);

    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let sizeBytes = 0;

    try {
      for await (const chunk of input.content) {
        if (chunk === undefined || chunk === null) {
          throw invalidRequest(
            "Artifact content stream yielded an empty chunk.",
          );
        }
        const buffer = Buffer.from(chunk);
        sizeBytes += buffer.length;
        if (sizeBytes > input.maxBytes) {
          throw payloadTooLarge(input.maxBytes);
        }
        hash.update(buffer);
        chunks.push(buffer);
      }
    } catch (error) {
      if (error instanceof ArtifactBlobStoreError) {
        throw error;
      }
      throw invalidRequest(
        error instanceof Error
          ? error.message
          : "Artifact content stream failed.",
      );
    }

    const body = Buffer.concat(chunks);
    const digest = `${SHA256_INTEGRITY_PREFIX}${hash.digest("hex")}`;

    if (input.expectedDigest !== undefined && input.expectedDigest !== digest) {
      throw digestMismatch();
    }

    this.blobs.set(input.key, {
      body: Buffer.from(body),
      sizeBytes,
      digest,
    });

    return { sizeBytes, digest };
  }

  async open(key: string): Promise<ArtifactBlobReadHandle> {
    assertSafeBlobKey(key);
    const entry = this.blobs.get(key);
    if (entry === undefined) {
      throw blobUnavailable(key);
    }

    const isolated = Buffer.from(entry.body);
    return {
      sizeBytes: entry.sizeBytes,
      stream: Readable.from([isolated]),
    };
  }

  async delete(key: string): Promise<void> {
    assertSafeBlobKey(key);
    this.blobs.delete(key);
  }
}

export function createMemoryArtifactBlobStore(): MemoryArtifactBlobStore {
  return new MemoryArtifactBlobStore();
}

export function createArtifactBlobStore(
  config: ArtifactStorageConfigRegistered,
): ArtifactBlobStore {
  void config;
  return createMemoryArtifactBlobStore();
}

const moduleShape: RegisteredArtifactBlobStoreModule = {
  createArtifactBlobStore,
};

export default moduleShape;

function assertWriteLimits(input: ArtifactBlobWriteInput): void {
  if (!Number.isFinite(input.maxBytes) || input.maxBytes < 0) {
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

  if (!SAFE_BLOB_KEY_PATTERN.test(key) || key.includes("..")) {
    throw invalidRequest("Blob key contains unsupported characters.");
  }
}

export { ARTIFACT_ERROR_CODES };
