#!/bin/sh
# Genera la configuración de ejecución y las cabeceras de seguridad a partir de API_ORIGIN.
# Ej.: API_ORIGIN=https://api.tudominio.com
set -eu
: "${API_ORIGIN:?Defina API_ORIGIN, p. ej. https://api.tudominio.com}"
API_ORIGIN="${API_ORIGIN%/}"
WS_ORIGIN="$(echo "$API_ORIGIN" | sed 's#^https://#wss://#; s#^http://#ws://#')"

cat > /usr/share/nginx/html/config.js <<JS
window.__KARDEX__ = { apiUrl: "${API_ORIGIN}/api", socketUrl: "${API_ORIGIN}" };
JS

mkdir -p /etc/nginx/kardex
cat > /etc/nginx/kardex/seguridad.conf <<CONF
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${API_ORIGIN} ${WS_ORIGIN}; worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
CONF
echo "Kardex: API en ${API_ORIGIN}"
