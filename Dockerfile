# Builder stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The production stage copies node_modules from here. Without pruning, the
# devDependencies ship with it -- typescript, ts-node and their tree, 196
# packages where the compiled entrypoint needs 31.
RUN npm prune --omit=dev

# Production stage
FROM node:24-slim AS production

WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

EXPOSE 3000
ENTRYPOINT [ "node", "build/index.js", "--http", "--port", "3000" ]
