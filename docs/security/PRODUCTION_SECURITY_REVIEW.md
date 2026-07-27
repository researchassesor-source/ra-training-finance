# Revisión de seguridad previa a producción

Estado actual: apto para una Preview aislada después de configurar su backend de pruebas; todavía no aprobado para producción.

## Corregido en esta rama

- secreto de autenticación fuera del código y sin fallback;
- contraseña de bootstrap fuera del código y fuera de logs;
- CORS del proxy limitado a mismo origen o `ALLOWED_ORIGINS`;
- CSP, HSTS, `nosniff`, anti-framing, Referrer Policy y Permissions Policy en Vercel;
- URL QR canónica obligatoria en Preview/Production;
- descarga con auditoría previa y confirmación posterior;
- PDF versionado, hash SHA-256 y referencia privada.

## Riesgos aceptados o pendientes

- La sesión continúa en `localStorage`; existe exposición ante XSS. No se añadirán nuevos secretos allí. La migración a cookie `HttpOnly`, `Secure` y `SameSite` queda pendiente para una fase de autenticación, porque exige cambiar Apps Script/proxy y cierre de sesiones.
- La CSP conserva `style-src 'unsafe-inline'` por compatibilidad con el frontend actual. Debe eliminarse cuando los estilos inline sean sustituidos o se adopten nonces.
- El artefacto Preview usa IndexedDB del navegador. Producción requiere un proveedor privado centralizado (por ejemplo Drive privado) antes de considerarse repositorio institucional definitivo.
- `npm audit --omit=dev` reporta dos entradas altas que corresponden al mismo aviso de CSRF en **RSC Mode** de React Router. El proyecto usa `BrowserRouter` exclusivamente en cliente, no define loaders/actions de servidor ni habilita RSC. Se acepta temporalmente solo para Preview aislada en `react-router-dom` 7.18.1 (última versión publicada consultada durante esta auditoría). Para Production queda pendiente actualizar a una versión corregida o contar con aceptación formal del responsable de seguridad; no se aplicó el downgrade automático porque reintroducía varias vulnerabilidades XSS/RCE/DoS anteriores.
- La auditoría completa también reporta Vite/esbuild por exposición del servidor de desarrollo. El servidor de desarrollo se limita a localhost y no forma parte del artefacto Vercel; la actualización mayor de Vite queda pendiente y debe probarse separadamente.
- El tamaño del bundle supera la recomendación de Vite; es rendimiento, no un bloqueador funcional de Preview.

## Controles antes de Production

Ejecutar `npm audit`, build, tests, pruebas del CSP real, revisión de `ALLOWED_ORIGINS`, validación de roles y pruebas completas en Apps Script/Sheets de pruebas. No publicar con pendientes de auditoría, URL QR bloqueada, aval `pending` en Production o vulnerabilidades críticas/altas sin decisión formal.
