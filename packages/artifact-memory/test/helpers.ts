import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { ArtifactBlobContentStream } from "@osva-ai/contracts";

export function streamFromParts(
  parts: readonly (Buffer | Uint8Array | string)[],
): ArtifactBlobContentStream {
  return Readable.from(parts.map((part) => Buffer.from(part)));
}

export async function readAll(
  stream: ArtifactBlobContentStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function expectedSha256(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}
