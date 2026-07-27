# Preparación de subdominio para Finance

No se modificaron DNS, dominios, Vercel Production ni la URL productiva.

## Recomendación provisional

`finance.ra-training.com`

Alternativas registradas, aún no aprobadas:

- `finanzas.ra-training.com`
- `gestion.ra-training.com`

## Configuración central

`src/config/brand.js` concentra el nombre de la aplicación y el origen público. `src/utils/qr.js` construye enlaces desde `VITE_PUBLIC_APP_URL` y, solo en desarrollo, cae al origen actual del navegador.

Antes de cambiar el dominio se debe:

1. Confirmar decisión institucional.
2. Configurar el dominio en Vercel sin eliminar el dominio actual.
3. Asignar `VITE_PUBLIC_APP_URL` por entorno Preview y Production.
4. Revisar HTTPS, redirecciones de login/logout y rutas SPA.
5. Restringir CORS y mantener `GAS_URL` únicamente en servidor.
6. Generar un despliegue nuevo, pues las variables de Vite se inyectan al compilar.
7. Probar QR antiguos y nuevos antes de cualquier redirección permanente.

Los certificados históricos deben continuar resolviendo desde la URL actual o mediante una redirección compatible.
