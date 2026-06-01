FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server-dist ./server-dist

ENV NODE_ENV=production
ENV PORT=3001
ENV ROOM_STORE_DRIVER=cloudbase
ENV TCB_ENV_ID=zombie-catan-d8g07asiy5e3f05c1
ENV CORS_ORIGINS=https://zombie-catan-d8g07asiy5e3f05c1-1435101306.tcloudbaseapp.com,https://zombie-catan-d8g07asiy5e3f05c1-1435101306.ap-shanghai.app.tcloudbase.com

EXPOSE 3001

CMD ["node", "server-dist/index.js"]
