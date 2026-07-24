# Demostración fiscal segura en Vercel Preview

## Objetivo

Permitir que un administrador autenticado revise el módulo completo de facturación desde una Preview sin desplegar `fiscal-service`, sin consultar datos reales y sin realizar tráfico fiscal. Todos los documentos son ficticios, carecen de validez tributaria y se ejecutan exclusivamente en el navegador.

## Arquitectura

La interfaz conserva el contrato público `fiscalApi`. `createFiscalApi` selecciona un adaptador:

- **Local:** `HttpFiscalApi`, conectado explícitamente mediante `VITE_FISCAL_API_URL` al servicio fiscal local.
- **Preview:** `PreviewFiscalApi`, sin `fetch`; usa `PreviewFiscalStore`, semilla ficticia y generadores XML/PDF del navegador.
- **Certificación:** no se habilita mediante esta demostración; requiere el servicio fiscal y controles reales.
- **Producción:** la demostración se bloquea, incluso si una bandera se activa por error, y nunca se trata como una emisión real.

La selección de Preview exige las banderas correctas, contexto explícito `preview`, dominio distinto del oficial y sesión normal con rol `admin`. Vendedor y aval no ven el menú ni acceden a la ruta.

## Variables exactas

```dotenv
VITE_ENABLE_SRI_BILLING=true
VITE_FISCAL_RUNTIME_CONTEXT=preview
VITE_FISCAL_PREVIEW_DEMO=true
VITE_FISCAL_USE_EXISTING_APP_DATA=false
```

No configurar `VITE_FISCAL_API_URL` ni `VITE_LOCAL_FISCAL_DEMO_AUTH` en Preview. Estas variables no son secretos y deben limitarse al entorno Preview de Vercel, nunca a Production.

## Datos y persistencia

La semilla contiene exclusivamente un emisor ficticio, seis inscripciones de escenarios distintos, cuatro servicios pendientes de revisión tributaria, formas de pago de prueba, una factura autorizada simuladamente y una nota de crédito autorizada simuladamente.

Los metadatos, XML pequeños, documentos, eventos, transmisiones y contadores ficticios se conservan bajo la clave versionada `ra-training:fiscal-preview:v1` de `localStorage`. No se guardan sesiones, tokens, contraseñas, certificados, llaves ni datos institucionales/productivos. Si el JSON está corrupto o la versión no coincide, se restaura la semilla.

En **Configuración fiscal → Información técnica → Reiniciar datos fiscales ficticios**, una confirmación elimina solo esa clave y repone la semilla. No cierra sesión ni borra datos de otros módulos.

## Capacidades y límites

La demo permite crear facturas con varias líneas, descuentos, impuestos, pagos y campos adicionales; simular el flujo; ver auditoría, transmisiones y XML; crear notas de crédito con control de saldo; y descargar XML/RIDE generados mediante `Blob` y jsPDF.

Los estados, firma, recepción y autorización son simulados y deterministas. El XML es una estructura demostrativa, no una validación XSD oficial. El RIDE incluye `ENTORNO DE PREVISUALIZACIÓN`, `SIN VALIDEZ TRIBUTARIA` y `NO CONECTADO AL SRI`.

La persistencia del navegador no ofrece las garantías de concurrencia, integridad, respaldo o custodia necesarias en producción. Esta Preview no llama al SRI, Apps Script fiscal, Google Sheets ni localhost, no envía correos y no sustituye el servicio fiscal real ni la certificación tributaria.
