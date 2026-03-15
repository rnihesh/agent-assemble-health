FROM node:22-slim AS deps

WORKDIR /app/mcp-server
COPY mcp-server/package*.json ./
RUN npm ci

FROM node:22-slim AS build

WORKDIR /app
COPY --from=deps /app/mcp-server/node_modules /app/mcp-server/node_modules
COPY mcp-server /app/mcp-server
COPY frontend /app/frontend

WORKDIR /app/mcp-server
RUN npm run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/mcp-server/node_modules /app/mcp-server/node_modules
COPY --from=build /app/mcp-server/dist /app/mcp-server/dist
COPY --from=build /app/mcp-server/package*.json /app/mcp-server/
COPY --from=build /app/frontend /app/frontend

WORKDIR /app/mcp-server
EXPOSE 3001

CMD ["node", "dist/index.js"]
