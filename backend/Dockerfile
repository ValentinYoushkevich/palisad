FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# B20: файлы принадлежат непривилегированному node — процесс не пишет в код
COPY --chown=node:node . .

EXPOSE 3100

# B20: не запускаемся под root
USER node

# B20: /api/health отвечает 200 только при живом коннекте к БД (fetch встроен в Node 22)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# B20: node — PID 1: npm не пробрасывает SIGTERM ребёнку, и graceful shutdown
# из server.js не срабатывал бы — контейнер убивался бы по таймауту
CMD ["node", "--loader", "./alias-loader.mjs", "server.js"]
