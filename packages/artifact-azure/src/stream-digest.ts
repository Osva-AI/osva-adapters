import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";

import {
  SHA256_INTEGRITY_PREFIX,
  type ArtifactBlobContentStream,
} from "@osva-ai/contracts";

import {
  ArtifactBlobStoreError,
  invalidRequest,
  payloadTooLarge,
} from "./errors.js";

export interface DigestingStreamResult {
  readonly stream: PassThrough;
  readonly digestPromise: Promise<{ sizeBytes: number; digest: string }>;
}

const UPLOAD_BUFFER_SIZE = 4 * 1024 * 1024;

export function uploadBufferSizeBytes(): number {
  return UPLOAD_BUFFER_SIZE;
}

export function createDigestingReadable(
  content: ArtifactBlobContentStream,
  maxBytes: number,
): DigestingStreamResult {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw invalidRequest("maxBytes must be a non-negative finite number.");
  }

  const pass = new PassThrough({ highWaterMark: UPLOAD_BUFFER_SIZE });
  const hash = createHash("sha256");
  let sizeBytes = 0;

  const digestPromise = (async (): Promise<{
    sizeBytes: number;
    digest: string;
  }> => {
    try {
      for await (const chunk of content) {
        if (chunk === undefined || chunk === null) {
          throw invalidRequest(
            "Artifact content stream yielded an empty chunk.",
          );
        }
        const buffer = Buffer.from(chunk);
        sizeBytes += buffer.length;
        if (sizeBytes > maxBytes) {
          throw payloadTooLarge(maxBytes);
        }
        hash.update(buffer);
        const canContinue = pass.write(buffer);
        if (!canContinue) {
          await new Promise<void>((resolve) => pass.once("drain", resolve));
        }
      }
      pass.end();
      return {
        sizeBytes,
        digest: `${SHA256_INTEGRITY_PREFIX}${hash.digest("hex")}`,
      };
    } catch (error) {
      pass.destroy(
        error instanceof Error ? error : new Error("Stream pipeline failed."),
      );
      if (error instanceof ArtifactBlobStoreError) {
        throw error;
      }
      throw invalidRequest(
        error instanceof Error
          ? error.message
          : "Artifact content stream failed.",
      );
    }
  })();

  return { stream: pass, digestPromise };
}
