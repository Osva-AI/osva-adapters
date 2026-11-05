#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  GHCR_OSVA_RC4,
  acquireOsvaRc4BaseImage,
  dockerImageExistsLocally,
  tagLocalDockerImage,
} from "./acquire-osva-rc4-base-image.mjs";

const LOCAL_TAG = "osva:1.1.0-rc.4-test-base";

/**
 * @param {object} config
 * @param {Set<string>} [config.localImages]
 * @param {boolean} [config.remoteManifest]
 * @param {boolean} [config.pullSucceeds]
 * @param {boolean} [config.tagSucceeds]
 * @param {boolean} [config.buildSucceeds]
 */
function createDockerMocks(config) {
  const calls = [];
  const localImages = new Set(config.localImages ?? []);
  let remoteManifest = config.remoteManifest ?? false;
  const pullSucceeds = config.pullSucceeds ?? true;
  const tagSucceeds = config.tagSucceeds ?? true;
  const buildSucceeds = config.buildSucceeds ?? true;

  const runCapture = (command, args) => {
    calls.push({ command, args, kind: "capture" });
    assert.equal(command, "docker");
    const [sub, ...rest] = args;
    if (sub === "image" && rest[0] === "inspect") {
      const ref = rest[1];
      if (!localImages.has(ref)) {
        throw new Error(`No such image: ${ref}`);
      }
      return { stdout: "", stderr: "" };
    }
    if (sub === "manifest" && rest[0] === "inspect") {
      if (!remoteManifest) {
        throw new Error("manifest unknown");
      }
      return { stdout: "{}", stderr: "" };
    }
    throw new Error(`unexpected runCapture: ${args.join(" ")}`);
  };

  const run = (command, args) => {
    calls.push({ command, args, kind: "run" });
    assert.equal(command, "docker");
    const [sub, ...rest] = args;
    if (sub === "pull") {
      if (!pullSucceeds) {
        throw new Error("pull failed");
      }
      localImages.add(rest[0]);
      return {};
    }
    if (sub === "tag") {
      if (!tagSucceeds) {
        throw new Error("tag failed");
      }
      const [source] = rest;
      if (!localImages.has(source)) {
        throw new Error(`No such image: ${source}`);
      }
      localImages.add(rest[1]);
      return {};
    }
    if (sub === "build") {
      if (!buildSucceeds) {
        throw new Error("build failed");
      }
      return {};
    }
    throw new Error(`unexpected run: ${args.join(" ")}`);
  };

  let buildInvoked = false;
  const buildFromSource = () => {
    buildInvoked = true;
    if (!buildSucceeds) {
      throw new Error("source build failed");
    }
    run("docker", ["build", "-t", LOCAL_TAG, "."]);
    localImages.add(LOCAL_TAG);
  };

  return {
    run,
    runCapture,
    buildFromSource,
    calls,
    get buildInvoked() {
      return buildInvoked;
    },
    localImages,
    set remoteManifest(value) {
      remoteManifest = value;
    },
  };
}

// Image already available locally
{
  const mocks = createDockerMocks({ localImages: [GHCR_OSVA_RC4] });
  const result = acquireOsvaRc4BaseImage({
    localTag: LOCAL_TAG,
    run: mocks.run,
    runCapture: mocks.runCapture,
    buildFromSource: mocks.buildFromSource,
  });
  assert.equal(result.baseImageProvenance, "ghcr-local-rc4");
  assert.equal(result.baseImage, GHCR_OSVA_RC4);
  assert.equal(mocks.buildInvoked, false);
  assert.ok(mocks.localImages.has(LOCAL_TAG));
  assert.doesNotThrow(() =>
    tagLocalDockerImage(mocks.run, mocks.runCapture, GHCR_OSVA_RC4, LOCAL_TAG),
  );
}

// Remote manifest + successful pull
{
  const mocks = createDockerMocks({ remoteManifest: true, pullSucceeds: true });
  const result = acquireOsvaRc4BaseImage({
    localTag: LOCAL_TAG,
    run: mocks.run,
    runCapture: mocks.runCapture,
    buildFromSource: mocks.buildFromSource,
  });
  assert.equal(result.baseImageProvenance, "ghcr-pulled-rc4");
  assert.equal(result.baseImage, GHCR_OSVA_RC4);
  assert.equal(mocks.buildInvoked, false);
  assert.deepEqual(
    mocks.calls.filter((c) => c.args[0] === "pull"),
    [{ command: "docker", args: ["pull", GHCR_OSVA_RC4], kind: "run" }],
  );
}

// Remote unavailable — source-build fallback
{
  const mocks = createDockerMocks({ remoteManifest: false });
  const result = acquireOsvaRc4BaseImage({
    localTag: LOCAL_TAG,
    run: mocks.run,
    runCapture: mocks.runCapture,
    buildFromSource: mocks.buildFromSource,
  });
  assert.equal(
    result.baseImageProvenance,
    "local-docker-build-from-osva-rc4-tag",
  );
  assert.equal(result.baseImage, LOCAL_TAG);
  assert.equal(mocks.buildInvoked, true);
}

// Manifest available but pull fails — source-build fallback
{
  const mocks = createDockerMocks({
    remoteManifest: true,
    pullSucceeds: false,
    buildSucceeds: true,
  });
  const result = acquireOsvaRc4BaseImage({
    localTag: LOCAL_TAG,
    run: mocks.run,
    runCapture: mocks.runCapture,
    buildFromSource: mocks.buildFromSource,
  });
  assert.equal(
    result.baseImageProvenance,
    "local-docker-build-from-osva-rc4-tag",
  );
  assert.equal(mocks.buildInvoked, true);
}

// Local tagging failure propagates
{
  const mocks = createDockerMocks({
    localImages: [GHCR_OSVA_RC4],
    tagSucceeds: false,
  });
  assert.throws(
    () =>
      acquireOsvaRc4BaseImage({
        localTag: LOCAL_TAG,
        run: mocks.run,
        runCapture: mocks.runCapture,
        buildFromSource: mocks.buildFromSource,
      }),
    /tag failed/,
  );
}

// Source-build failure propagates (no silent fallback)
{
  const mocks = createDockerMocks({
    remoteManifest: false,
    buildSucceeds: false,
  });
  assert.throws(
    () =>
      acquireOsvaRc4BaseImage({
        localTag: LOCAL_TAG,
        run: mocks.run,
        runCapture: mocks.runCapture,
        buildFromSource: mocks.buildFromSource,
      }),
    /source build failed/,
  );
}

// Never tag a nonexistent source image
{
  const mocks = createDockerMocks({ localImages: [] });
  assert.throws(
    () =>
      tagLocalDockerImage(
        mocks.run,
        mocks.runCapture,
        GHCR_OSVA_RC4,
        LOCAL_TAG,
      ),
    /Refusing to tag missing Docker image/,
  );
}

assert.equal(
  dockerImageExistsLocally(
    createDockerMocks({ localImages: [GHCR_OSVA_RC4] }).runCapture,
    GHCR_OSVA_RC4,
  ),
  true,
);
assert.equal(
  dockerImageExistsLocally(
    createDockerMocks({ localImages: [] }).runCapture,
    GHCR_OSVA_RC4,
  ),
  false,
);

console.log("acquire-osva-rc4-base-image.test.mjs passed");
