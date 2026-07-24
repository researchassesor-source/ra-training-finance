# Informe de pruebas - 24 de julio de 2026

## Automatizadas ejecutadas durante la etapa

| Comando | Resultado |
|---|---|
| `npm test` | 6 archivos, 31 pruebas aprobadas |
| `npm run build` | aprobado; 2704 módulos transformados; advertencia conocida por chunk grande |
| `npm --prefix fiscal-service run typecheck` | aprobado |
| `npm --prefix fiscal-service run build` | aprobado |
| `npm --prefix fiscal-service run lint` | aprobado |
| `npm --prefix fiscal-service test` | 12 archivos, 49 pruebas aprobadas |
| `npm --prefix fiscal-service run test:postgres-memory` | 1 archivo, 1 prueba aprobada |
| `npm audit --json` | 8 hallazgos heredados: 1 bajo, 4 moderados, 2 altos y 1 crítico |
| `npm --prefix fiscal-service audit --json` | 0 vulnerabilidades |

## Cubierto

Firma criptográfica/verificación, PKCS#12 negativo, SOAP/fixtures, múltiples autorizaciones, reintento con transporte inyectado, bloqueo de red, readiness, enmascarado, importación JSON/CSV, múltiples líneas/pagos, descuentos, comprador distinto, notas parciales, RIDE/PDF de factura y nota de crédito, correo simulado, auditoría, idempotencia, permisos, path traversal y 100 secuenciales.

## Validación visual y de archivos

- Navegador local: 1440 px, 900 px y 390 px; sin desbordamiento horizontal móvil y sin errores de consola.
- RIDE renderizado con Poppler: A4, una página, datos ficticios, advertencia local y sin valores privados del emisor real.
- Se corrigió una segunda página vacía causada por el pie y el solapamiento de formas de pago multilínea.
- Evidencias funcionales anteriores: `docs/facturacion-sri/evidence-v2/`.
- Evidencias del ajuste visual y arquitectónico final: `docs/facturacion-sri/evidence-v3/`.

No existen pruebas contra SRI real, correo real, Apps Script, Sheets, Vercel ni PostgreSQL real. Los hallazgos del audit raíz requieren una actualización separada y controlada de jsPDF, Vite y React Router; no se aplicaron cambios mayores automáticos.

## Demostración de Preview

Se añadieron pruebas unitarias del selector seguro, rol administrador, store versionado, recuperación/reset, API sin `fetch`, cálculos exactos, flujo y resultados simulados, persistencia, factura/nota de crédito, saldo, XML escapado y descargas Blob XML/PDF.

La validación de navegador se ejecutó con `fiscal-service` apagado en 1440 × 900, 900 × 900 y 390 × 844. Se recorrieron creación/proceso de factura, XML, RIDE, nota de crédito, recarga, persistencia y reset aislado; no hubo errores ni advertencias de consola y no existió desbordamiento horizontal. Las ocho capturas y el detalle del recorrido están en `evidence-preview/README.md`.
