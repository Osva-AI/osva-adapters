import { Readable } from "node:stream";

import { RestError } from "@azure/storage-blob";

import type {
  AzureBlockBlobLike,
  AzureBlobContainerLike,
} from "../src/azure-artifact-blob-store.js";

export interface FakeAzureBlobOptions {
  readonly onUploadStream?: (
    blobName: string,
    stream: NodeJS.ReadableStream,
    bufferSize: number,
    maxConcurrency: number,
  ) => Promise<void>;
  readonly onDownload?: (blobName: string) => Promise<void>;
  readonly onBeginCopyFromURL?: (
    destinationName: string,
    sourceUrl: string,
  ) => Promise<{ copyStatus: string } | void>;
  readonly onDelete?: (blobName: string) => void;
}

export function createFakeAzureContainer(options: FakeAzureBlobOptions = {}): {
  container: AzureBlobContainerLike;
  blobs: Map<string, Buffer>;
} {
  const blobs = new Map<string, Buffer>();
  const urlFor = (name: string): string =>
    `https://fake-storage.example/container/${encodeURIComponent(name)}`;

  const container: AzureBlobContainerLike = {
    getBlockBlobClient(blobName: string): AzureBlockBlobLike {
      return {
        get url(): string {
          return urlFor(blobName);
        },
        async uploadStream(
          stream: NodeJS.ReadableStream,
          bufferSize: number,
          maxConcurrency: number,
        ): Promise<void> {
          if (options.onUploadStream !== undefined) {
            await options.onUploadStream(
              blobName,
              stream,
              bufferSize,
              maxConcurrency,
            );
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of stream as AsyncIterable<Uint8Array>) {
            chunks.push(Buffer.from(chunk));
          }
          blobs.set(blobName, Buffer.concat(chunks));
        },
        async beginCopyFromURL(sourceUrl: string): Promise<{
          pollUntilDone(): Promise<{ copyStatus: string }>;
        }> {
          const override = await options.onBeginCopyFromURL?.(
            blobName,
            sourceUrl,
          );
          if (override !== undefined && override.copyStatus !== "success") {
            return {
              async pollUntilDone(): Promise<{ copyStatus: string }> {
                return { copyStatus: override.copyStatus };
              },
            };
          }

          const sourceName = decodeURIComponent(
            sourceUrl.split("/").pop() ?? "",
          );
          const source = blobs.get(sourceName);
          if (source === undefined) {
            throw new Error(`Fake copy source missing: ${sourceName}`);
          }
          blobs.set(blobName, Buffer.from(source));
          return {
            async pollUntilDone(): Promise<{ copyStatus: string }> {
              return { copyStatus: "success" };
            },
          };
        },
        async deleteIfExists(): Promise<{ succeeded: boolean }> {
          options.onDelete?.(blobName);
          const existed = blobs.has(blobName);
          blobs.delete(blobName);
          return { succeeded: existed };
        },
        async getProperties(): Promise<{ contentLength?: number }> {
          const body = blobs.get(blobName);
          if (body === undefined) {
            throw new RestError("Blob not found.", { statusCode: 404 });
          }
          return { contentLength: body.length };
        },
        async download(): Promise<{
          readableStreamBody?: NodeJS.ReadableStream;
        }> {
          if (options.onDownload !== undefined) {
            await options.onDownload(blobName);
          }
          const body = blobs.get(blobName);
          if (body === undefined) {
            throw new RestError("Blob not found.", { statusCode: 404 });
          }
          return {
            readableStreamBody: Readable.from([Buffer.from(body)]),
          };
        },
      };
    },
  };

  return { container, blobs };
}
