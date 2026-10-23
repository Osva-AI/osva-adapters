#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const ADAPTER_PACKAGE_DIR = path.join(REPO_ROOT, "packages", "artifact-memory");

function run(command, args, options = {}) {
  const useShell =
    process.platform === "win32" &&
    (command === "pnpm" || command === "npm" || command === "npx");
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? "inherit",
    shell: useShell,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (exit ${String(result.status)})`,
    );
  }
}

async function packAdapter() {
  const packDir = await mkdtemp(path.join(os.tmpdir(), "osva-adapters-pack-"));
  run("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: ADAPTER_PACKAGE_DIR,
  });
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(packDir)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (files.length !== 1) {
    throw new Error(`Expected one adapter tarball, found ${files.join(", ")}`);
  }
  return { tgz: path.join(packDir, files[0]), packDir };
}

async function packContracts() {
  const packDir = await mkdtemp(path.join(os.tmpdir(), "osva-contracts-pack-"));
  const contractsRoot = path.join(
    ADAPTER_PACKAGE_DIR,
    "node_modules",
    "@osva-ai",
    "contracts",
  );
  await access(path.join(contractsRoot, "package.json"));
  run("npm", ["pack", "--pack-destination", packDir], {
    cwd: contractsRoot,
    shell: true,
  });
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(packDir)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (files.length !== 1) {
    throw new Error(
      `Expected one contracts tarball, found ${files.join(", ")}`,
    );
  }
  return { tgz: path.join(packDir, files[0]), packDir };
}

async function main() {
  const workRoot = await mkdtemp(
    path.join(os.tmpdir(), "osva-a11-external-consumer-"),
  );
  const consumerRoot = path.join(workRoot, "consumer");
  let adapterPackDir;
  let contractsPackDir;

  try {
    run("pnpm", ["--filter", "@osva-ai/adapter-artifact-memory", "build"]);

    const adapterPacked = await packAdapter();
    adapterPackDir = adapterPacked.packDir;
    const contractsPacked = await packContracts();
    contractsPackDir = contractsPacked.packDir;

    const installRoot = consumerRoot;
    await mkdir(path.join(installRoot, "src"), { recursive: true });

    const consumerPackage = {
      name: "osva-adapter-artifact-memory-external-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@osva-ai/adapter-artifact-memory": adapterPacked.tgz,
        "@osva-ai/contracts": contractsPacked.tgz,
      },
      devDependencies: {
        typescript: "6.0.3",
        "@types/node": "24.13.4",
      },
      scripts: {
        typecheck: "tsc -p tsconfig.json --noEmit",
        build: "tsc -p tsconfig.json",
        smoke: "node dist/smoke.js",
      },
    };

    await writeFile(
      path.join(installRoot, "package.json"),
      `${JSON.stringify(consumerPackage, null, 2)}\n`,
    );

    await writeFile(
      path.join(installRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            skipLibCheck: true,
            types: ["node"],
            outDir: "dist",
            rootDir: "src",
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      )}\n`,
    );

    await writeFile(
      path.join(installRoot, "src", "smoke.ts"),
      `import { Readable } from "node:stream";
import { createArtifactBlobStore } from "@osva-ai/adapter-artifact-memory";
import { ARTIFACT_STORAGE_DRIVER_REGISTERED } from "@osva-ai/contracts";

const store = createArtifactBlobStore({
  driver: ARTIFACT_STORAGE_DRIVER_REGISTERED,
  maxBytes: 4096,
  registerModule: "unused",
});

const key = "workspace/ws/artifact/external-pack";
const body = Buffer.from("external-pack-consumer-smoke");
await store.write({
  key,
  content: Readable.from([body]),
  maxBytes: 4096,
});
const handle = await store.open(key);
const chunks: Buffer[] = [];
for await (const chunk of handle.stream) {
  chunks.push(Buffer.from(chunk));
}
if (Buffer.compare(Buffer.concat(chunks), body) !== 0) {
  throw new Error("External consumer readback mismatch");
}
await store.delete(key);
console.log("External pack consumer smoke passed.");
`,
    );

    run("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: installRoot,
      shell: true,
    });
    run("npm", ["run", "typecheck"], { cwd: installRoot, shell: true });
    run("npm", ["run", "build"], { cwd: installRoot, shell: true });
    run("npm", ["run", "smoke"], { cwd: installRoot, shell: true });

    const adapterPackageJson = JSON.parse(
      await readFile(path.join(ADAPTER_PACKAGE_DIR, "package.json"), "utf8"),
    );
    if (adapterPackageJson.name !== "@osva-ai/adapter-artifact-memory") {
      throw new Error("Unexpected adapter package name in workspace.");
    }
  } finally {
    await rm(workRoot, { force: true, recursive: true });
    if (adapterPackDir !== undefined) {
      await rm(adapterPackDir, { force: true, recursive: true });
    }
    if (contractsPackDir !== undefined) {
      await rm(contractsPackDir, { force: true, recursive: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
