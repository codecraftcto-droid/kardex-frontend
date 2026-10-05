# Kardex — Frontend

SPA en Vue 3 + Pinia + Vue Router + TailwindCSS 4 (PWA). Consume la API de
[`kardex-backend`](https://github.com/codecraftcto-droid/kardex-backend).

## Desarrollo

```bash
cp .env.example .env     # VITE_API_URL=http://localhost:3000/api
npm install
npm run dev              # http://localhost:5173
npm run dev:movil        # HTTPS en la red local (cámara y PWA desde el celular)
```

## Producción (Docker / Dokploy)

La URL de la API se configura **al iniciar el contenedor**, no al compilar:

```env
API_ORIGIN=https://api.kardex.codecraft.net.pe
```

nginx genera `/config.js` y las cabeceras de seguridad (CSP) con ese valor.
Guía completa: `DESPLIEGUE.md` en el repositorio del backend.
