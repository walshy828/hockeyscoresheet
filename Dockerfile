# ---- build the web app ----
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY shared shared
COPY web web
RUN npm -w web run build

# ---- runtime: Node's built-in SQLite, no native modules ----
FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev
COPY shared shared
COPY server server
COPY --from=web /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
