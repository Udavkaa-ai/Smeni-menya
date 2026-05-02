FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
# Railway provides $PORT — fallback to 8080 locally.
ENV PORT=8080
EXPOSE 8080

# 0.0.0.0 binding via Express (default), listens on $PORT.
CMD ["node", "src/index.js"]
