# Propuesta — primera transmisión real a SRI Pruebas

**Estado: NO ejecutada.** Este documento es la propuesta que el usuario debe autorizar
explícitamente antes de la primera llamada real a `celcer.sri.gob.ec`. Nada de lo
descrito aquí se ha enviado.

## 1. Verificación previa del contribuyente (punto 4 del hardening)

Confirmado el 11/08/2026 de forma **independiente** contra la herramienta pública del
propio SRI — no solo contra el documento interno de la empresa:

- Herramienta: `https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/publico/validezEmisor.jsf`
  ("Validación de emisor", Facturación Electrónica → Consulta de emisores autorizados).
- Consulta: RUC `0691787373001`.
- Resultado: **RESEARCH ASSESSOR TRAINING S.A.S.**, autorizado el `19/06/2026 01:56`,
  Chimborazo/Riobamba — coincide exactamente con lo que indicaba la Ficha Maestra.

**Límite honesto de esta verificación**: la herramienta pública de "Validez de Emisor"
confirma autorización general como emisor electrónico, pero su tabla de resultados **no
desglosa Pruebas vs. Producción** por separado — no hay una columna "Ambiente". No se
encontró una herramienta pública equivalente que distinga ambientes explícitamente. La
única confirmación totalmente concluyente de que el ambiente de Pruebas/Certificación
funciona para este RUC es la propia llamada real (RECIBIDA + consulta de Autorización)
contra `celcer.sri.gob.ec` — que es exactamente el paso pendiente de autorización.

## 2. Receptor de la prueba — verificado contra la ficha 2.34 real, no asumido

Se buscó explícitamente en `docs/fiscal/sri-official/ficha_extracted.txt` (texto
extraído de la ficha 2.34 real descargada en Fase 3):

- **"PRUEBAS SERVICIO DE RENTAS INTERNAS"** aparece literalmente como
  `razonSocialComprador` en varios ejemplos oficiales de XML dentro de la propia ficha
  2.34 (líneas ~2871, 4581, 4849, 5103, 5587, 5891) — es una convención de la propia
  ficha, no algo inventado por nosotros ni copiado de un documento antiguo.
- **"9999999999999"** (13 nueves) aparece como `identificacionComprador` junto con
  `tipoIdentificacionComprador=07` (VENTA A CONSUMIDOR FINAL) y
  `razonSocialComprador=CONSUMIDOR FINAL` (línea 620-624 y ejemplos en 6619-7318).
- Sección **9.10** de la ficha 2.34 dice textualmente: *"Entre la lista de clientes se
  encuentra el 'Consumidor final'... Si el valor de la factura es mayor a 50 USD se
  deberá especificar obligatoriamente los datos del adquirente."* — es decir,
  CONSUMIDOR FINAL / 9999999999999 es válido sin restricción para facturas ≤ USD 50.

**Decisión**: usar `CONSUMIDOR FINAL` / `9999999999999` / tipo `07`. Nuestra factura de
prueba es de USD 1,00 — muy por debajo del umbral de 50 USD — así que esto es
plenamente conforme con la ficha 2.34, no una interpretación forzada. No se necesita
ningún dato de una persona real.

## 3. Producto/servicio — catálogo `TEST_ONLY`, no toca el catálogo productivo

Se agregó `PRUEBA_TECNICA_SRI` al catálogo fiscal (`apps-script/Fiscal.gs`,
`FISCAL_CATALOG_INICIAL`), marcado `TestOnly: true`. `validarItemFiscal_` lo bloquea de
forma **absoluta** en `environment=production` (sin excepción de administrador, a
diferencia del gate de `ValidacionTributaria`). Usar este ítem:

- **NO** confirma ni modifica el tratamiento tributario de `CAPACITACION` /
  `CAPACITACION_CERTIFICADO`, que siguen en `ValidacionTributaria=pendiente`.
- Una eventual autorización en Pruebas usando `PRUEBA_TECNICA_SRI` **no constituye
  evidencia** de que los cursos reales deban facturarse con IVA 0% — son conceptos
  fiscales completamente separados en el catálogo.

## 4. Datos propuestos para la primera factura de prueba

| Campo | Valor |
|---|---|
| Ambiente | `test` (Pruebas) — `SRI_ALLOW_PRODUCTION` nunca configurado |
| Endpoint Recepción | `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline` |
| RUC emisor | `0691787373001` |
| Establecimiento / punto | `001` / `002` |
| Secuencial | `000000001` (primero, sin conflicto verificado en Fase 2) |
| Tipo de comprobante | Factura, XML `2.1.0` |
| Producto | `PRUEBA_TECNICA_SRI` (catálogo `TestOnly`, no productivo) |
| Cantidad / precio | 1 × USD 1,00 |
| IVA | 0% (solo para este ítem de prueba, no confirma el catálogo productivo) |
| Receptor | `CONSUMIDOR FINAL` |
| Identificación receptor | `9999999999999` (tipo `07`, conforme ficha 2.34 §9.10) |
| Forma de pago | `20` — transferencia simulada |
| Fecha | La del día en que se autorice la ejecución |
| Secretos requeridos | `SRI_CERT_P12_BASE64`, `SRI_CERT_PASSWORD` (server-only, ninguno configurado todavía) |
| Quedará almacenado | Sheets: clave de acceso, hashes, estado, mensajes del SRI, número/fecha de autorización si la hay — nunca el P12 ni la contraseña |
| Confirmación de que NO es Producción | `resolveSriEndpoint` bloquea `production` salvo `SRI_ALLOW_PRODUCTION=true` (nunca seteado); la URL usada contiene `celcer`, nunca `cel` |

## 5. Qué falta antes de ejecutar esto

1. Autorización explícita del usuario para esta transmisión concreta.
2. Cargar `SRI_CERT_P12_BASE64` y `SRI_CERT_PASSWORD` en el entorno donde corra
   (Preview de Vercel) — ver `scripts/configure-sri-certificate.ps1`.
3. Confirmar que no se ha activado sin querer `SRI_ALLOW_PRODUCTION`.
