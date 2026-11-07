FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && mkdir -p uploads && chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=3001
USER node
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
