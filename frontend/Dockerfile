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

# Build de produção. --base=/ garante caminhos absolutos (/assets/...) nos
# ficheiros gerados, para que funcionem em qualquer profundidade de URL
# (ex: /carreiras/xxx/vaga/1) — o padrão do Vite já é este, mas fica
# explícito para nunca mais haver dúvida se o projeto voltar a ganhar algum
# plugin que mude o "base" por baixo (foi o que aconteceu com o plugin do
# Electron, entretanto removido do projeto).
RUN npx vite build --base=/

# Production stage
FROM nginx:alpine

# Copiar build para o nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Configurar Nginx para SPA. Duas regras separadas são essenciais:
# 1. /assets/* (ficheiros com hash no nome, gerados pelo build) nunca deve
#    cair no fallback do index.html — se faltar, é suposto dar 404 a sério,
#    e fica em cache longa porque o nome muda sempre que o conteúdo muda.
# 2. index.html nunca deve ficar em cache no navegador — é o que garante que
#    a app aponta sempre para os ficheiros .js/.css corretos do último
#    deploy. Sem isto, um navegador com o index.html antigo em cache tenta
#    carregar um ficheiro .js que já não existe (foi substituído no deploy
#    seguinte), o nginx cai no fallback de SPA para esse pedido também, e o
#    browser recebe HTML onde esperava JavaScript — página em branco com o
#    erro "Expected a JavaScript-or-Wasm module script".
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location /assets/ { \
    try_files $uri =404; \
    add_header Cache-Control "public, max-age=31536000, immutable"; \
  } \
  location / { \
    try_files $uri $uri/ /index.html; \
    add_header Cache-Control "no-cache"; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
