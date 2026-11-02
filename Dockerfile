# syntax=docker/dockerfile:1

# ---------- Estágio 1: build ----------
# Debian (bookworm) nos dois estágios -> mesma glibc, binário nativo do
# better-sqlite3 compilado aqui funciona no runner.
FROM node:20-bookworm AS builder
WORKDIR /app

# Ferramentas de build para o better-sqlite3 (caso não haja binário pré-compilado).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Instala dependências (camada cacheável).
COPY package*.json ./
RUN npm ci

# Compila o TypeScript.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies, mantém só as de produção (inclui o better-sqlite3 já compilado).
RUN npm prune --omit=dev

# ---------- Estágio 2: runtime ----------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copia só o necessário do estágio de build.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Diretório do banco (montado como volume no compose, para persistir).
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/server.js"]
