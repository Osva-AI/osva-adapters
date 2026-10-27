# syntax=docker/dockerfile:1
# OCI image for @osva-ai/runtime-cli-sidecar (operator-built; not published from CI).

FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-fund --no-audit \
  && npm install @osva-ai/contracts@1.1.0-rc.4 @osva-ai/runtime-protocol@1.1.0-rc.4 @osva-ai/sdk@1.1.0-rc.4 --no-save \
  && npx tsc -p tsconfig.json

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/package.json ./package.json
COPY fixtures ./fixtures
RUN npm install --omit=dev --no-fund --no-audit \
    @osva-ai/contracts@1.1.0-rc.4 \
    @osva-ai/runtime-protocol@1.1.0-rc.4 \
    @osva-ai/sdk@1.1.0-rc.4 \
  && mkdir -p /workspace \
  && chown -R node:node /app /workspace

USER node
ENV OSVA_SIDECAR_HOST=0.0.0.0 \
    OSVA_SIDECAR_PORT=9321 \
    OSVA_SIDECAR_WORKSPACE_ROOT=/workspace \
    NODE_ENV=production

EXPOSE 9321
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:9321/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/bin/start-sidecar.js"]
