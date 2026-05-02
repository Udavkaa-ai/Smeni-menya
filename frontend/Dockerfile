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
COPY --from=build /app/dist /usr/share/nginx/html

# Defaults — override in compose / Railway
ENV BACKEND_HOST=backend:8080
ENV PORT=80
# Limit envsubst to OUR vars so nginx vars like $host are not touched.
ENV NGINX_ENVSUBST_TEMPLATE_VARS='${BACKEND_HOST} ${PORT}'

# Honor Railway's $PORT
RUN sed -i 's/listen 80;/listen ${PORT};/' /etc/nginx/templates/default.conf.template

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
