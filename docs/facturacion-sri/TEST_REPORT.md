# Informe de pruebas - 24 de julio de 2026

## Automatizadas ejecutadas durante la etapa

| Comando | Resultado |
|---|---|
| `npm test` | 3 archivos, 10 pruebas aprobadas |
| `npm run build` | aprobado; 2697 módulos transformados; advertencia conocida por chunk de 1.63 MB |
| `npm --prefix fiscal-service run typecheck` | aprobado |
| `npm --prefix fiscal-service run build` | aprobado |
| `npm --prefix fiscal-service run lint` | aprobado |
| `npm --prefix fiscal-service test` | 11 archivos, 47 pruebas aprobadas |
| `npm --prefix fiscal-service run test:postgres-memory` | 1 archivo, 1 prueba aprobada |
| `npm audit --json` | 8 hallazgos heredados: 1 bajo, 4 moderados, 2 altos y 1 crítico |
| `npm --prefix fiscal-service audit --json` | 0 vulnerabilidades |

## Cubierto

Firma criptográfica/verificación, PKCS#12 negativo, SOAP/fixtures, múltiples autorizaciones, reintento con transporte inyectado, bloqueo de red, readiness, enmascarado, importación JSON/CSV, múltiples líneas/pagos, descuentos, comprador distinto, notas parciales, RIDE/PDF de factura y nota de crédito, correo simulado, auditoría, idempotencia, permisos, path traversal y 100 secuenciales.

## Validación visual y de archivos

- Navegador local: 1440 px, 900 px y 390 px; sin desbordamiento horizontal móvil y sin errores de consola.
- RIDE renderizado con Poppler: A4, una página, datos ficticios, advertencia local y sin valores privados del emisor real.
- Se corrigió una segunda página vacía causada por el pie y el solapamiento de formas de pago multilínea.
- Evidencias: `docs/facturacion-sri/evidence-v2/`.

No existen pruebas contra SRI real, correo real, Apps Script, Sheets, Vercel ni PostgreSQL real. Los hallazgos del audit raíz requieren una actualización separada y controlada de jsPDF, Vite y React Router; no se aplicaron cambios mayores automáticos.
