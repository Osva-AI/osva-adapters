#!/usr/bin/env node

/** Pinned OSVA RC4 image on GHCR (acceptance harnesses). */
export const GHCR_OSVA_RC4 = "ghcr.io/osva-ai/osva:1.1.0-rc.4";

/**
 * @param {typeof import("../a1-4/lib/shell.mjs").runCapture} runCapture
 * @param {string} imageRef
 */
export function dockerImageExistsLocally(runCapture, imageRef) {
  try {
    runCapture("docker", ["image", "inspect", imageRef]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {typeof import("../a1-4/lib/shell.mjs").runCapture} runCapture
 * @param {string} imageRef
 */
function dockerManifestExistsRemotely(runCapture, imageRef) {
  try {
    runCapture("docker", ["manifest", "inspect", imageRef]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {typeof import("../a1-4/lib/shell.mjs").run} run
 * @param {typeof import("../a1-4/lib/shell.mjs").runCapture} runCapture
 * @param {string} sourceRef
 * @param {string} localTag
 */
export function tagLocalDockerImage(run, runCapture, sourceRef, localTag) {
  if (!dockerImageExistsLocally(runCapture, sourceRef)) {
    throw new Error(
      `Refusing to tag missing Docker image ${sourceRef} as ${localTag}`,
    );
  }
  run("docker", ["tag", sourceRef, localTag]);
}

/**
 * Resolve the OSVA RC4 base image: local cache, GHCR pull, or source build.
 *
 * @param {object} options
 * @param {string} [options.ghcrImage]
 * @param {string} options.localTag
 * @param {typeof import("../a1-4/lib/shell.mjs").run} options.run
 * @param {typeof import("../a1-4/lib/shell.mjs").runCapture} options.runCapture
 * @param {() => void} options.buildFromSource — must throw on failure (no silent fallback)
 * @returns {{ baseImage: string, baseImageProvenance: string }}
 */
export function acquireOsvaRc4BaseImage({
  ghcrImage = GHCR_OSVA_RC4,
  localTag,
  run,
  runCapture,
  buildFromSource,
}) {
  if (dockerImageExistsLocally(runCapture, ghcrImage)) {
    tagLocalDockerImage(run, runCapture, ghcrImage, localTag);
    return {
      baseImage: ghcrImage,
      baseImageProvenance: "ghcr-local-rc4",
    };
  }

  const remoteManifest = dockerManifestExistsRemotely(runCapture, ghcrImage);
  if (remoteManifest) {
    try {
      run("docker", ["pull", ghcrImage]);
    } catch {
      buildFromSource();
      return {
        baseImage: localTag,
        baseImageProvenance: "local-docker-build-from-osva-rc4-tag",
      };
    }

    if (!dockerImageExistsLocally(runCapture, ghcrImage)) {
      throw new Error(
        `docker pull reported success but ${ghcrImage} is not present locally`,
      );
    }

    tagLocalDockerImage(run, runCapture, ghcrImage, localTag);
    return {
      baseImage: ghcrImage,
      baseImageProvenance: "ghcr-pulled-rc4",
    };
  }

  buildFromSource();
  return {
    baseImage: localTag,
    baseImageProvenance: "local-docker-build-from-osva-rc4-tag",
  };
}
