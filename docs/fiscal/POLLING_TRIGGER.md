# Trigger de polling fiscal (Apps Script → `/api/fiscal/poll`)

Arquitectura elegida en Fase 4 (ver `architecture.md`): un *time-driven trigger* de
Apps Script llama cada 5 minutos a `/api/fiscal/poll`, en vez de usar Vercel Cron de
pago. **Nada de esto está instalado ni activo todavía.** Esta guía es para cuando el
usuario autorice explícitamente activarlo — no antes.

## Qué hace cada pieza

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| `ejecutarPollingFiscal()` | `apps-script/Fiscal.gs` | Se ejecuta con el trigger. Llama a `/api/fiscal/poll` con el secreto en un header. Nunca loguea el secreto ni el cuerpo completo de la respuesta. |
| `instalarTriggerPollingFiscal()` | `apps-script/Fiscal.gs` | Crea el trigger (cada 5 min). Idempotente: no duplica si ya existe. |
| `eliminarTriggerPollingFiscal()` | `apps-script/Fiscal.gs` | Quita el trigger — para desactivar la automatización. |
| `/api/fiscal/poll` | `api/fiscal/poll.js` | Valida el secreto, pide a Apps Script la lista de facturas pendientes, sondea Autorización por cada una. |

## Requisitos antes de instalar (ninguno configurado todavía)

Dos Script Properties en el proyecto de Apps Script (Extensiones → Apps Script →
Configuración del proyecto → Propiedades de secuencias de comandos):

- `FISCAL_POLL_ENDPOINT_URL`: la URL completa de `/api/fiscal/poll` en el deployment
  de Vercel que se vaya a usar (Preview primero, nunca Production sin autorización
  explícita).
- `FISCAL_POLL_SECRET`: el mismo valor que la variable de entorno `FISCAL_POLL_SECRET`
  configurada en Vercel para ese deployment. Debe generarse como un secreto
  aleatorio largo (p. ej. `openssl rand -hex 32`), nunca un valor memorable.

Además, Vercel necesita (server-only, nunca `VITE_*`):

- `FISCAL_POLL_SECRET` (el mismo valor que arriba).
- `FISCAL_SERVICE_TOKEN` (el secreto servidor-a-servidor hacia Apps Script, distinto
  del anterior — dos saltos de confianza distintos, dos secretos distintos).
- `GAS_URL` (ya existe, es el mismo que usa `api/proxy.js`).

`/api/fiscal/poll` **no** necesita el certificado P12 — sondear autorización es una
consulta de solo lectura al SRI, no firma nada.

## Cómo instalar (cuando el usuario autorice)

1. Cargar las dos Script Properties de arriba en el proyecto de Apps Script.
2. Cargar las variables correspondientes en Vercel (Preview).
3. Desde el editor de Apps Script, ejecutar manualmente `instalarTriggerPollingFiscal`
   una sola vez.
4. Confirmar en Extensiones → Apps Script → Activadores que el trigger quedó creado.
5. Revisar Extensiones → Apps Script → Ejecuciones para ver los logs de
   `ejecutarPollingFiscal` (solo código HTTP y conteo de procesadas, nunca secretos).

## Cómo desinstalar

Ejecutar manualmente `eliminarTriggerPollingFiscal` desde el editor de Apps Script.
