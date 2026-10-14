FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts
COPY server/ server/
COPY firebase-applet-config.json ./
RUN npm run build:wall-api && npm prune --omit=dev --legacy-peer-deps --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/package.json package.json
COPY --from=build --chown=node:node /app/api-dist api-dist
USER node
EXPOSE 8080
CMD ["node", "api-dist/server.cjs"]
