#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function run(command, args, options = {}) {
  const useShell =
    process.platform === "win32" &&
    (command === "pnpm" || command === "npm" || command === "docker");
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

export async function packAdapter(packageDir) {
  const packDir = await mkdtemp(path.join(os.tmpdir(), "osva-a15-pack-"));
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: packageDir });
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(packDir)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (files.length !== 1) {
    throw new Error(
      `Expected one tarball in ${packDir}, found ${files.join(", ")}`,
    );
  }
  return { tgz: path.join(packDir, files[0]), packDir };
}

export async function verifyRegistrationExport(packageName, tgzPath) {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "osva-a15-reg-"));
  try {
    await writeFile(
      path.join(workRoot, "package.json"),
      JSON.stringify(
        { name: "reg-check", private: true, type: "module" },
        null,
        2,
      ),
    );
    run("npm", ["install", "--no-save", tgzPath], {
      cwd: workRoot,
      shell: true,
    });
    const scope = packageName.startsWith("@")
      ? packageName.split("/")[0].slice(1)
      : null;
    const shortName = packageName.includes("/")
      ? packageName.split("/")[1]
      : packageName;
    const entryPath = scope
      ? path.join(
          workRoot,
          "node_modules",
          `@${scope}`,
          shortName,
          "dist",
          "index.js",
        )
      : path.join(workRoot, "node_modules", shortName, "dist", "index.js");
    const mod = await import(pathToFileURL(entryPath).href);
    if (typeof mod.createArtifactBlobStore !== "function") {
      throw new Error("Named export createArtifactBlobStore missing");
    }
    const reg = mod.registeredArtifactBlobStoreModule ?? mod.default;
    if (!reg || typeof reg.createArtifactBlobStore !== "function") {
      throw new Error(
        "registeredArtifactBlobStoreModule/default export invalid",
      );
    }
  } finally {
    await rm(workRoot, { force: true, recursive: true });
  }
}

export async function runPackPipeline(packageName, packageDir) {
  run("pnpm", ["--filter", packageName, "build"]);
  return packAdapter(packageDir);
}

export { run };
