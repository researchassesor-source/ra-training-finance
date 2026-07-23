# Informe de pruebas — 23 de julio de 2026

Entorno: Windows, Node 22.19.0, npm 10.9.3, zona `America/Guayaquil`. Docker no estaba instalado. Todas las pruebas utilizaron fixtures ficticios y API en `127.0.0.1`.

## Resultados automáticos

| Comando | Resultado | Duración observada |
|---|---:|---:|
| `npm test` | 1 archivo, 5 pruebas aprobadas | 1.361 s total; Vitest 0.487 s |
| `npm run build` | 2694 módulos, build aprobado | 22.914 s |
| `npm --prefix fiscal-service run typecheck` | aprobado, 0 errores | 1.904 s |
| `npm --prefix fiscal-service run lint` | aprobado, 0 errores | 1.911 s |
| `npm --prefix fiscal-service test` | 7 archivos, 34 pruebas aprobadas | 2.356 s total; Vitest 1.64 s |
| `npm --prefix fiscal-service run build` | aprobado | 1.823 s |

Las 34 pruebas fiscales cubren exactitud/redondeo/errores, clave y módulo 11, transición inválida, 50 reservas concurrentes, configuración segura, traversal, rol, idempotencia, duplicado por fuente, factura completa, PDF, eventos, nota de crédito, exceso rechazado y ocho escenarios del simulador.

## API local

- `/api/v1/health`: HTTP 200, `sriConnection:false`.
- `/api/v1/readiness`: HTTP 200, `storage:inmemory`, `persistent:false`, `sriConnection:false`.
- `/docs/`: HTTP 200.
- acceso con rol vendedor a facturas: HTTP 403.
- logs revisados: solicitudes a `127.0.0.1:4010`; no se observó tráfico a SRI, Apps Script, correo ni producción.

## XML y fuentes

- XML generado de factura 1.1.0: `xmllint` exit 0, valida; 2100 bytes en el caso final.
- XML generado de nota de crédito 1.1.0: `xmllint` exit 0, valida; 2037 bytes.
- La declaración XML 1.1 del XSD oficial de nota de crédito produce una advertencia de parser, no un error de validación.
- Los samples oficiales de los paquetes descargados también se comprobaron contra sus XSD.
- Manifiesto SHA-256 contiene 17 archivos y preserva los originales.

## RIDE

- PDF A4, una página, 3962 bytes en la inspección final, sin cifrado ni JavaScript.
- `pdfinfo` confirma título, autor, asunto de simulación y PDF 1.3.
- Renderizado a PNG a 144 dpi y revisado visualmente después de dos correcciones: encabezado, caja del comprobante, detalles, totales y advertencia no se superponen.
- Marca de agua visible: “AMBIENTE LOCAL / SIN VALIDEZ TRIBUTARIA”.
- Poppler informó ausencia de fuentes opcionales `Symbol`/`ArialUnicode` al rasterizar; Helvetica del PDF se mostró correctamente.

## Validación visual

- Factura $100.00 + IVA ficticio $15.00 = $115.00; secuencial, clave y siete etapas visibles.
- Nota de crédito ficticia $10.00 creada desde factura autorizada simulada y procesada.
- Capturas: 1440, 900 y 390 px. En 1440, 900 y 390 se midió `scrollWidth === clientWidth`.
- Sin botones superpuestos en las vistas finales, sin texto cortado en tablero/formulario y sin errores nuevos de consola.
- React Router emitió inicialmente dos avisos futuros; se activaron sus banderas de compatibilidad y no reaparecieron después de recargar.
- La descarga iniciada desde la UI no generó un evento de descarga detectable por el controlador del navegador; el mismo endpoint fue probado en integración y devolvió `%PDF`, y el archivo resultante se abrió/renderizó.

## Seguridad y dependencias

- Búsqueda sobre 109 archivos modificados/nuevos: sin marcadores reales de clave privada y sin archivos P12/PFX/PEM/KEY/CRT.
- Las coincidencias de palabras sensibles corresponden a controles, documentación, esquemas oficiales y contraseña ficticia local de Docker Compose.
- `npm audit` raíz: 8 hallazgos heredados (1 bajo, 4 moderados, 2 altos, 1 crítico). No se aplicó corrección automática por riesgo de cambios fuera de alcance.
- `npm audit` de `fiscal-service`: 0 hallazgos.

## Infraestructura pendiente

Docker/PostgreSQL: no ejecutado porque `docker` no está disponible. Compose, migración, seed y adaptador quedaron preparados. Por tanto, la persistencia PostgreSQL se clasifica **PARCIAL**; no se afirma que esté validada.

## Advertencia de build

Vite generó correctamente el build, pero mantiene el aviso heredado de un chunk principal superior a 500 KiB (1,627.64 KiB minificado; 464.15 KiB gzip). No se refactorizó el empaquetado global en esta tarea.
