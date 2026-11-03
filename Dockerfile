# Imagem do FinancasPro para rodar no seu computador (docker-compose.yml).
# Mantém as dependências de desenvolvimento: o start aplica as migrations (drizzle-kit)
# e o seed (tsx) antes de subir o app.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
  && mkdir -p /app/data \
  && chown -R node:node /app/data /app/.next

USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "scripts/docker-start.mjs"]
