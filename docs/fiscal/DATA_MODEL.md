# Modelo de datos — módulo fiscal SRI

Implementado en `apps-script/Fiscal.gs` (hojas nuevas, aditivas a `SHEET_HEADERS` en
`Code.gs`) y probado con el harness de `src/test/appsScriptFiscal.test.js`
(`createAppsScriptHarness`, que simula `SpreadsheetApp`/`LockService`/`PropertiesService`
en Node vía `vm`).

División de responsabilidades: **Apps Script valida estructura y política** (catálogo,
enteros no negativos, transiciones de estado permitidas, unicidad de secuencial bajo
`LockService`). **No** recalcula la aritmética monetaria sensible al redondeo — eso vive
probado en `lib/fiscal/money.js` (Node/Vercel) para no duplicar esa lógica en dos
runtimes. Ver `docs/fiscal/architecture.md`.

## Hojas

| Hoja | Propósito |
|---|---|
| `FacturasFiscales` | Una fila por factura. Espejo del modelo `Invoice` del prompt maestro (RUC, serie, secuencial, clave de acceso, totales, referencias a XML/RIDE, estado SRI). |
| `FacturaItems` | Líneas de detalle, cada una amarrada a un código del catálogo (`ConfiguracionFiscal`) y su tarifa. |
| `SecuenciaFiscal` | Contador atómico por `Environment + Establishment + EmissionPoint + DocumentType`. Una sola fila por combinación; `LastSequential` solo incrementa. |
| `AuditoriaFiscal` | Append-only, mismo patrón que `AuditoriaCertificados`: toda mutación (o intento rechazado) queda registrada con actor, fecha, resultado y motivo. |
| `ConfiguracionFiscal` | Catálogo de conceptos facturables y su tarifa de IVA en puntos básicos (0 = 0%). Editable, versionado (`CatalogVersion` en cada línea de factura referencia la versión vigente al momento de facturar). |

## Migración

`migrarModuloFiscal` (acción `migrarModuloFiscal`) es idempotente y exige **dos**
confirmaciones explícitas simultáneas (defensa en profundidad, no una u otra):

1. Parámetro `confirmacion: "APLICAR_MODULO_FISCAL"` en la llamada.
2. Script Property `SRI_MIGRATION_CONFIRMATION = "APPLY_SRI_MIGRATION_ONCE"`, que la
   migración borra automáticamente al terminar.

Crea las hojas faltantes (reutilizando `getSheet`, que ya es idempotente y auto-agrega
columnas nuevas sin tocar las existentes) y siembra el catálogo inicial solo si no
existe: `CAPACITACION` y `CAPACITACION_CERTIFICADO`, ambos 0% IVA, según la Ficha
Maestra v2.0 §4. No incluye "Consultoría educativa independiente" ni "Investigación" —
esos quedan explícitamente fuera hasta validación tributaria.

## Estados de factura

Tomados de la Ficha Maestra v2.0 §5 (más reciente y más simple que la lista del primer
prompt):

```
DRAFT → SEQUENCE_RESERVED → GENERATED → SIGNED → RECEIVED → PROCESSING → AUTHORIZED → DELIVERY_PENDING → DELIVERED
                                            ↓          ↓           ↓
                                      NOT_AUTHORIZED  RETURNED → GENERATED (reintento controlado)
```

`AUTHORIZED` es inmutable: la única transición permitida desde ahí es hacia
`DELIVERY_PENDING`. Cualquier otra transición se rechaza y se audita como tal
(`transicionEstadoFactura`, tabla `FISCAL_TRANSICIONES_VALIDAS`).

## Reserva de secuencial (`reservarSecuencialFiscal`)

Mismo patrón que la reserva de códigos de certificado: `LockService.getScriptLock()`
envuelve la lectura del contador, el incremento y la escritura, para que dos
solicitudes concurrentes nunca reciban el mismo secuencial. Antes de asignar el primer
secuencial de una serie nueva, verifica que no existan ya facturas con ese
`Establishment + EmissionPoint` sin contador asociado (dato heredado o conflicto) — si
las hay, **se detiene y reporta**, no elige otra serie automáticamente (regla 25 del
prompt maestro).

## Pendiente (fases siguientes)

- Cálculo de la clave de acceso de 49 dígitos (`lib/fiscal/claveAcceso.js`, ya
  implementado y probado) todavía no está conectado a `reservarSecuencialFiscal` — eso
  ocurre en Fase 3, cuando exista el endpoint Vercel que orquesta generación XML.
- Rol `ACCOUNTING_VIEWER` (Fase 9): las funciones de lectura (`getFacturasFiscales`,
  `getAuditoriaFiscal`) hoy son admin-only; se relajarán a lectura para ese rol cuando
  se implemente.
