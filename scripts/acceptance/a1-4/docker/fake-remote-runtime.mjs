#!/usr/bin/env node
import http from "node:http";

const PROTOCOL_VERSION = "1";
const PATHS = {
  artifactCreate: "/v1/runtime/capabilities/artifacts/create",
  artifactGet: "/v1/runtime/capabilities/artifacts/get",
  artifactContent: "/v1/runtime/capabilities/artifacts/content",
};

const host = process.env.FAKE_RUNTIME_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.FAKE_RUNTIME_PORT ?? "9090", 10);

async function executeRemoteArtifact(request) {
  const input = request.input;
  const payload =
    input && typeof input === "object" && "content" in input
      ? String(input.content)
      : "a14-remote-artifact-payload";
  const form = new FormData();
  form.append("executionId", request.executionId);
  form.append("name", "remote-artifact.txt");
  form.append("mediaType", "text/plain");
  form.append(
    "file",
    new Blob([payload], { type: "text/plain" }),
    "remote-artifact.txt",
  );

  const createResponse = await fetch(
    `${request.capabilities.endpoint}${PATHS.artifactCreate}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${request.capabilities.token}` },
      body: form,
    },
  );
  const created = await createResponse.json();
  if (created.outcome !== "SUCCEEDED" || !created.artifact) {
    throw new Error("Remote artifact create failed.");
  }

  const metadataResponse = await fetch(
    `${request.capabilities.endpoint}${PATHS.artifactGet}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.capabilities.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        executionId: request.executionId,
        artifactId: created.artifact.id,
      }),
    },
  );
  const metadata = await metadataResponse.json();
  if (metadata.artifact?.name !== "remote-artifact.txt") {
    throw new Error("Remote artifact metadata get failed.");
  }

  const contentUrl = new URL(
    `${request.capabilities.endpoint}${PATHS.artifactContent}`,
  );
  contentUrl.searchParams.set("executionId", request.executionId);
  contentUrl.searchParams.set("artifactId", created.artifact.id);
  const contentResponse = await fetch(contentUrl, {
    headers: { authorization: `Bearer ${request.capabilities.token}` },
  });
  const roundTrip = await contentResponse.text();
  if (roundTrip !== payload) {
    throw new Error("Remote artifact content round-trip failed.");
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    executionId: request.executionId,
    outcome: "SUCCEEDED",
    output: {
      reference: created.artifact.reference,
      roundTrip,
    },
  };
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.method !== "POST" || req.url !== "/execute") {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    const body = await executeRemoteArtifact(parsed);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })().catch((error) => {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "fake_runtime_failed" }));
  });
});

server.listen(port, host, () => {
  console.log(
    `fake-remote-runtime listening on http://${host}:${String(port)}`,
  );
});
