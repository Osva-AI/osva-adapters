import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

import { configurationError } from "./errors.js";
import { sanitizeExternalMessage } from "./sanitize.js";

/** Environment variables read at factory time (operator-controlled). */
export const AZURE_ARTIFACT_ENV = {
  CONTAINER: "OSVA_ARTIFACT_AZURE_CONTAINER",
  CONNECTION_STRING: "OSVA_ARTIFACT_AZURE_CONNECTION_STRING",
  ACCOUNT_NAME: "OSVA_ARTIFACT_AZURE_ACCOUNT_NAME",
  ACCOUNT_KEY: "OSVA_ARTIFACT_AZURE_ACCOUNT_KEY",
  BLOB_ENDPOINT: "OSVA_ARTIFACT_AZURE_BLOB_ENDPOINT",
} as const;

export interface ResolvedAzureArtifactConfig {
  readonly containerName: string;
  readonly blobServiceClient: BlobServiceClient;
}

function readNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function assertSafeContainerName(containerName: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(containerName)) {
    throw configurationError(
      "OSVA_ARTIFACT_AZURE_CONTAINER must be a valid Azure container name (3–63 lowercase alphanumeric characters and hyphens).",
    );
  }
}

function createClientFromConnectionString(
  connectionString: string,
): BlobServiceClient {
  try {
    return BlobServiceClient.fromConnectionString(connectionString);
  } catch (error) {
    const detail =
      error instanceof Error
        ? sanitizeExternalMessage(error.message)
        : "Invalid connection string.";
    throw configurationError(
      `Failed to parse ${AZURE_ARTIFACT_ENV.CONNECTION_STRING}: ${detail}`,
    );
  }
}

function createClientFromSharedKey(
  accountName: string,
  accountKey: string,
  blobEndpoint: string | undefined,
): BlobServiceClient {
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const url = blobEndpoint ?? `https://${accountName}.blob.core.windows.net`;
  try {
    return new BlobServiceClient(url, credential);
  } catch (error) {
    const detail =
      error instanceof Error
        ? sanitizeExternalMessage(error.message)
        : "Invalid blob endpoint.";
    throw configurationError(
      `Failed to create Azure Blob service client: ${detail}`,
    );
  }
}

export function resolveAzureArtifactConfigFromEnv(): ResolvedAzureArtifactConfig {
  const containerName = readNonEmptyEnv(AZURE_ARTIFACT_ENV.CONTAINER);
  if (containerName === undefined) {
    throw configurationError(
      `${AZURE_ARTIFACT_ENV.CONTAINER} is required for @osva-ai/adapter-artifact-azure.`,
    );
  }
  assertSafeContainerName(containerName);

  const connectionString = readNonEmptyEnv(
    AZURE_ARTIFACT_ENV.CONNECTION_STRING,
  );
  const accountName = readNonEmptyEnv(AZURE_ARTIFACT_ENV.ACCOUNT_NAME);
  const accountKey = readNonEmptyEnv(AZURE_ARTIFACT_ENV.ACCOUNT_KEY);
  const blobEndpoint = readNonEmptyEnv(AZURE_ARTIFACT_ENV.BLOB_ENDPOINT);

  if (connectionString !== undefined) {
    if (accountName !== undefined || accountKey !== undefined) {
      throw configurationError(
        `Set either ${AZURE_ARTIFACT_ENV.CONNECTION_STRING} or ${AZURE_ARTIFACT_ENV.ACCOUNT_NAME} + ${AZURE_ARTIFACT_ENV.ACCOUNT_KEY}, not both.`,
      );
    }
    return {
      containerName,
      blobServiceClient: createClientFromConnectionString(connectionString),
    };
  }

  if (accountName === undefined || accountKey === undefined) {
    throw configurationError(
      `Azure credentials are required: set ${AZURE_ARTIFACT_ENV.CONNECTION_STRING} or both ${AZURE_ARTIFACT_ENV.ACCOUNT_NAME} and ${AZURE_ARTIFACT_ENV.ACCOUNT_KEY}.`,
    );
  }

  return {
    containerName,
    blobServiceClient: createClientFromSharedKey(
      accountName,
      accountKey,
      blobEndpoint,
    ),
  };
}
