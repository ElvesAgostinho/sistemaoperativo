# Build stage
FROM node:20-alpine AS build

# Receber URL da API
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

# Copiar dependências primeiro (cache layer)
COPY package*.json ./

# Usar npm ci para instalação determinística (usa package-lock.json exato)
RUN npm ci

# Copiar código fonte
COPY . .

# Build de produção
RUN npx vite build

# Production stage
FROM nginx:alpine

# Copiar build para o nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Configurar Nginx para SPA (React Router)
RUN echo 'server { \
  listen 80; \
  location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
