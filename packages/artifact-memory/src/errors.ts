import {
  ARTIFACT_ERROR_CODES,
  type ArtifactErrorCode,
} from "@osva-ai/contracts";

export class ArtifactBlobStoreError extends Error {
  readonly code: ArtifactErrorCode;

  constructor(code: ArtifactErrorCode, message: string) {
    super(message);
    this.name = "ArtifactBlobStoreError";
    this.code = code;
  }
}

export function payloadTooLarge(maxBytes: number): ArtifactBlobStoreError {
  return new ArtifactBlobStoreError(
    ARTIFACT_ERROR_CODES.ARTIFACT_PAYLOAD_TOO_LARGE,
    `Artifact payload exceeds maxBytes (${String(maxBytes)}).`,
  );
}

export function digestMismatch(): ArtifactBlobStoreError {
  return new ArtifactBlobStoreError(
    ARTIFACT_ERROR_CODES.ARTIFACT_DIGEST_MISMATCH,
    "Artifact digest does not match expectedDigest.",
  );
}

export function blobUnavailable(key: string): ArtifactBlobStoreError {
  return new ArtifactBlobStoreError(
    ARTIFACT_ERROR_CODES.ARTIFACT_UNAVAILABLE,
    `Artifact blob is unavailable for key '${key}'.`,
  );
}

export function invalidRequest(message: string): ArtifactBlobStoreError {
  return new ArtifactBlobStoreError(
    ARTIFACT_ERROR_CODES.ARTIFACT_INVALID_REQUEST,
    message,
  );
}
