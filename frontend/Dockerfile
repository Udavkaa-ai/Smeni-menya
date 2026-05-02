FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_API_BASE=/api
ARG VITE_WS_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_WS_BASE=$VITE_WS_BASE
RUN npm run build

FROM nginx:1.27-alpine
# Use nginx env-var template substitution at startup.
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Auto-detect DNS resolver from /etc/resolv.conf at boot (runs before envsubst).
COPY docker-entrypoint.d/15-set-resolver.sh /docker-entrypoint.d/15-set-resolver.sh
RUN chmod +x /docker-entrypoint.d/15-set-resolver.sh
COPY --from=build /app/dist /usr/share/nginx/html

# Defaults — override via Railway / docker-compose env.
# Default to docker-compose's "backend" service over private HTTP.
ENV BACKEND_HOST=backend:8080
ENV BACKEND_PROTO=http
ENV BACKEND_HOST_HEADER=backend
ENV PORT=80

# Restrict envsubst to OUR vars so nginx vars ($host, $scheme, etc.) are not touched.
ENV NGINX_ENVSUBST_TEMPLATE_VARS='${BACKEND_HOST} ${BACKEND_PROTO} ${BACKEND_HOST_HEADER} ${PORT}'

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
