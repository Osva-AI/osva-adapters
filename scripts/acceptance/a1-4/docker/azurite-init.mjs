#!/usr/bin/env node
import { BlobServiceClient } from "@azure/storage-blob";

const connectionString = process.env.OSVA_ARTIFACT_AZURE_CONNECTION_STRING;
const containerName = process.env.OSVA_ARTIFACT_AZURE_CONTAINER;

if (!connectionString || !containerName) {
  console.error(
    "OSVA_ARTIFACT_AZURE_CONNECTION_STRING and container required.",
  );
  process.exit(1);
}

const client = BlobServiceClient.fromConnectionString(connectionString);
const container = client.getContainerClient(containerName);
await container.createIfNotExists();
console.log(`Azurite container ready: ${containerName}`);
