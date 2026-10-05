# ── Frontend Kardex: compilación con Vite y servido con nginx ──
FROM node:20-bookworm-slim AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# La URL de la API NO se fija aquí: se configura al iniciar el contenedor (API_ORIGIN)
RUN npx vite build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-kardex-config.sh /docker-entrypoint.d/40-kardex-config.sh
COPY --from=compilacion /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-kardex-config.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
