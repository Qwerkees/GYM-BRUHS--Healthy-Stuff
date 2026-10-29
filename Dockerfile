FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/gym-bruhs.sqlite
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
