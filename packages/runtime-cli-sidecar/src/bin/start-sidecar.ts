#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { loadSidecarConfigFromEnv } from "../config.js";
import { createFixtureCliProvider } from "../providers/fixture-provider.js";
import { createCliSidecar } from "../sidecar.js";

async function main(): Promise<void> {
  const config = loadSidecarConfigFromEnv();
  await mkdir(config.workspaceRoot, { recursive: true });

  const provider = createFixtureCliProvider({
    workspaceRoot: config.workspaceRoot,
  });

  const sidecar = createCliSidecar({ provider, config });
  await sidecar.listen();

  console.log(
    JSON.stringify({
      event: "sidecar_listening",
      host: config.host,
      port: config.port,
      providerId: provider.providerId,
    }),
  );

  const shutdown = async (signal: string) => {
    console.log(JSON.stringify({ event: "sidecar_signal", signal }));
    try {
      await sidecar.close();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
