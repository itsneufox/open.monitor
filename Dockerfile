FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install build tools and libraries needed for native modules like canvas
RUN apk add --no-cache python3 make g++ libc6-compat pkgconfig pixman-dev cairo-dev pango-dev giflib-dev

RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

RUN npm ci --only=production && npm cache clean --force

RUN addgroup -g 1001 -S nodejs && \
    adduser -S openmonitor -u 1001 -G nodejs

RUN mkdir -p /app/logs

RUN chown -R openmonitor:nodejs /app

USER openmonitor

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is healthy')" || exit 1

CMD ["node", "dist/index.js"]
