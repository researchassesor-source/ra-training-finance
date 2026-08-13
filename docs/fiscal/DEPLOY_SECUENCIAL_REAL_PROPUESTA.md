# Propuesta — desplegar y validar la reserva atómica real de secuencial

**Estado: NO ejecutada.** Ningún paso de este documento se ha realizado. Este es
exactamente el detalle que pediste antes de autorizar cualquier despliegue: qué
archivos, qué acciones, y por qué no tocan datos existentes.

**Decisión confirmada (2026-08-10):** Opción A — reusar `PRUEBAS CERTIFICADOS V3`,
condicionada a pasar el checklist de la sección 0 primero. La reserva del
secuencial `001-002-000000001` debe quedar asociada a la MISMA factura
`TEST_ONLY` que luego se envía al SRI — nunca una reserva desechable, y si algo
falla después de reservar, se corrige/reanuda esa misma factura vía la máquina de
estados, nunca se crea otra ni se reserva otro número.

## 0. Checklist de aislamiento — hazlo tú, manualmente, antes de que toquemos nada

Todo esto es de solo lectura (no cambia nada), en tu cuenta de Google y en el
dashboard de Vercel. Anota los 7 valores; si cualquiera falla, nos detenemos ahí.

1. **Spreadsheet de pruebas**: en Google Drive, abre `PRUEBAS CERTIFICADOS V3`.
   Copia su ID desde la URL: `https://docs.google.com/spreadsheets/d/**ESTE_ID**/edit`.
2. **No es Producción**: compara ese ID contra el ID del Spreadsheet real que usa
   Producción (el que abres para operar certificados reales día a día, o el que
   está referenciado en la configuración de Producción de Vercel — ver punto 6).
   **Deben ser IDs distintos.** Si coinciden, DETENTE — no continúes, avísame.
3. **Proyecto Apps Script vinculado**: desde esa copia, **Extensiones → Apps
   Script**. Anota el nombre del proyecto que se abre y confirma en
   **Configuración del proyecto** que el "Recurso vinculado" es el Spreadsheet del
   punto 1 (no otro).
4. **Deployment `/exec` actual**: en ese proyecto, **Desplegar → Gestionar
   implementaciones**. Copia la URL `.../exec` de la implementación activa (si no
   hay ninguna todavía, anótalo — significa que aún no se ha desplegado como web
   app).
5. **`GAS_URL` en Vercel Preview**: dashboard de Vercel → proyecto → **Settings →
   Environment Variables** → filtrar por entorno **Preview** → valor de `GAS_URL`.
   Compáralo contra la URL del punto 4: **deben coincidir** (o el de Preview debe
   ser, al menos, claramente una URL de pruebas, no la de Producción).
6. **`GAS_URL` en Vercel Production**: mismo lugar, filtrando por **Production**.
   Anota esa URL — es la que NO debe tocarse en ningún paso posterior.
7. **Production no depende de lo que vamos a modificar**: confirma que la URL del
   punto 6 es DISTINTA de la del punto 4/5. Si Production y Preview compartieran
   hoy el mismo `GAS_URL`, desplegar `Fiscal.gs` ahí afectaría Producción — en ese
   caso DETENTE y avísame antes de continuar; habría que crear una copia de
   pruebas separada primero (Opción B del documento original).

Pásame los 7 resultados (solo los hechos: mismo/distinto, sí/no — no hace falta
pegar URLs completas si prefieres no hacerlo) y seguimos con la sección 3 solo si
todo quedó en orden.

## 1. Por qué esto hace falta

`reservarSecuencialFiscal` (`apps-script/Fiscal.gs:443`) + `LockService`
(`conBloqueoFiscal`) es el mecanismo real de reserva atómica de Fase 2. Existe en el
código desde hace varias fases y está cubierto por `appsScriptFiscal.test.js` — pero
**nunca se ha ejecutado contra un backend real de Google Sheets**, solo contra
`appsScriptHarness.js` (una simulación en `vm` de Node). No hay ningún
`FISCAL_SERVICE_TOKEN` vivo, ninguna hoja `SecuenciaFiscal` real, ningún despliegue
`/exec` sirviendo las acciones fiscales todavía.

Por eso el pre-flight (`scripts/preflight-sri-pruebas.mjs`) ya no reserva ni consume
nada — solo usa un secuencial propuesto. La reserva real solo puede validarse
desplegando el código real a un proyecto real de Apps Script/Sheets.

**Importante — yo no puedo ejecutar ninguno de los pasos de este documento.** No
tengo acceso a tu cuenta de Google. Todos los pasos de la sección 3 son manuales, de
tu parte, igual que los scripts que abren el `.p12`.

## 2. Decisión (confirmada) — Opción A

Se descarta crear infraestructura nueva. Se reusa `PRUEBAS CERTIFICADOS V3`
—condicionado a que el checklist de la sección 0 pase—, pegándole también
`Fiscal.gs` y corriendo `migrarModuloFiscal` ahí. `lib/fiscal/orchestration/
gasClient.js` lee `process.env.GAS_URL` por defecto, la misma variable que ya usa
`api/proxy.js` para Certificados, así que un solo `GAS_URL` de Preview sirve ambos
módulos sin ningún cambio de código.

## 3. Pasos exactos (todos manuales, en tu cuenta de Google — solo tras pasar la sección 0)

a. **Spreadsheet**: abrir la copia `PRUEBAS CERTIFICADOS V3` ya confirmada en la
   sección 0.

b. **Apps Script vinculado**: el mismo proyecto confirmado en el punto 3 de la
   sección 0 — no crear uno nuevo.

c. **Código a actualizar — qué cambia y qué no**:
   - `apps-script/Code.gs`: reemplazar por el de esta rama
     (`feature/sri-integration-production-ready`). El diff contra lo que hoy corre
     ahí es de solo **33 líneas** (2 eliminadas, el resto añadidas): agrega
     `serviceToken` a la desestructuración de `processRequest`, un `if` que solo
     activa la ruta de autenticación por servicio cuando la acción está en el
     allowlist fiscal (cualquier otra acción sigue exactamente igual que hoy,
     `validateToken(token)`), y 12 entradas nuevas en el mapa `handlers` para las
     acciones fiscales. **Ninguna función ni handler de Certificados/Usuarios/
     Inscripciones se modifica o se borra** — está cubierto por el test de
     regresión de seguridad `appsScriptCertificateSecurity.test.js`.
   - `apps-script/Fiscal.gs`: archivo `.gs` **nuevo** (804 líneas) dentro del mismo
     proyecto — no reemplaza ni toca ningún archivo existente.
   Guardar (Ctrl+S) ambos.

d. **Script Properties** (Configuración del proyecto → Propiedades de secuencias de
   comandos) — crear, **todas exclusivas de esta copia de pruebas**, nunca
   reutilizar valores de Producción:
   - `AUTH_SECRET`: omitir si la copia ya tiene una configurada de antes (no la
     toques).
   - `BOOTSTRAP_ADMIN_PASSWORD`: solo si hiciera falta un primer usuario admin de
     pruebas (probablemente no, la copia ya tiene usuarios de prueba); eliminarla
     apenas se use.
   - `FISCAL_SERVICE_TOKEN`: nuevo, no existe todavía en ningún entorno. Generarlo
     TÚ, en tu propia terminal, y pegarlo directamente en el campo de Apps
     Script — nunca en este chat:
     ```bash
     openssl rand -hex 32
     ```
     (en PowerShell: `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })`).
   - `SRI_MIGRATION_CONFIRMATION` = `APPLY_SRI_MIGRATION_ONCE` — temporal, solo
     durante el paso (e); Apps Script la borra sola al final.

e. **Migración idempotente**: ejecutar manualmente `migrarModuloFiscal` una vez
   desde el editor de Apps Script, con un usuario admin de pruebas y
   `params.confirmacion = "APLICAR_MODULO_FISCAL"`. Qué hace exactamente
   (`apps-script/Fiscal.gs:154-206`):
   - Llama a `getSheet()` sobre `FacturasFiscales`, `FacturaItems`,
     `SecuenciaFiscal`, `AuditoriaFiscal`, `ConfiguracionFiscal` — las crea si no
     existen, o añade columnas nuevas si faltan. **No toca ninguna otra hoja**
     (`Usuarios`, `Certificados`, `Inscripciones`, etc.) — `getSheet` solo opera
     sobre el nombre de hoja que se le pasa.
   - Siembra `FISCAL_CATALOG_INICIAL` (los 3 ítems, incluido `PRUEBA_TECNICA_SRI`
     con `TestOnly=true`) en `ConfiguracionFiscal`, solo si el código no existe ya.
   - Al final borra la Script Property `SRI_MIGRATION_CONFIRMATION` — confirmar que
     quedó eliminada.
   - **Confirmar que aparecen exactamente estas 5 hojas nuevas** en el Spreadsheet:
     `FacturasFiscales`, `FacturaItems`, `SecuenciaFiscal`, `AuditoriaFiscal`,
     `ConfiguracionFiscal` — y que `ConfiguracionFiscal` tiene 3 filas
     (`CAPACITACION`, `CAPACITACION_CERTIFICADO`, `PRUEBA_TECNICA_SRI`).

f. **Despliegue web**: Desplegar → Gestionar implementaciones → editar (lápiz) la
   implementación activa → **Nueva versión** (no "Nueva implementación" — así se
   conserva la misma URL `/exec` ya usada por Certificados en Preview, sin tener
   que reconfigurar nada). Ejecutar como el propietario de la copia, mismo acceso
   restringido de siempre.

g. **Vercel — entorno Preview únicamente, nunca Production**:
   - `GAS_URL`: si ya apuntaba a esta copia (confirmado en la sección 0), no hace
     falta tocarlo.
   - `FISCAL_SERVICE_TOKEN` = el mismo valor generado en (d), pegado directamente
     en el campo de Vercel — nunca en este chat.
   - Confirmar explícitamente que **Production de Vercel no se toca**: sigue
     apuntando al `GAS_URL` real de Certificados en Producción (punto 6 de la
     sección 0).

h. **Verificar que Certificados/Usuarios/datos existentes quedaron intactos**:
   desde la Preview ya configurada, hacer login con un usuario de prueba existente
   y probar `getInscripciones` o `verificarCertificado` sobre un certificado
   ficticio ya creado antes de este despliegue — debe funcionar exactamente igual
   que antes. Revisar que las hojas `Certificados`, `Usuarios`, `Inscripciones`
   tengan el mismo número de filas que tenían antes del despliegue.

## 4. Cómo se valida el mecanismo (esto sí puedo ejecutarlo yo, cuando confirmes)

Una vez tengas la URL `/exec` de pruebas y el `FISCAL_SERVICE_TOKEN`, compártelos
como variables de entorno locales (nunca pegados como texto en el chat — por
ejemplo en un `.env.local` que yo no imprima, o exportadas en la sesión de shell
antes de que yo corra el comando). Con eso puedo, vía
`lib/fiscal/orchestration/gasClient.js`:

1. Llamar `crearBorradorFactura` con el mismo ítem `PRUEBA_TECNICA_SRI` y el mismo
   receptor `CONSUMIDOR FINAL` del pre-flight.
2. Llamar `reservarSecuencialFiscal` sobre ese borrador y confirmar que devuelve
   `{ establishment: '001', emissionPoint: '002', sequential: '000000001' }` —solo
   si `SecuenciaFiscal` no tiene ya un contador para `001-002` en `test` (si lo
   tuviera, significaría que alguien más ya reservó antes y me detengo a avisarte
   en vez de continuar)—, que aparece una fila nueva en `SecuenciaFiscal`
   (`LastSequential=1`) y que `FacturasFiscales` pasa a `Status=SEQUENCE_RESERVED`.

**Decisión confirmada**: esta factura reservada ES la factura técnica `TEST_ONLY`
que después se firma y se envía de verdad — no una reserva desechable. Si algo
falla después de reservar (antes del envío), la corrección/reintento se hace sobre
esta misma `FacturaID` siguiendo `FISCAL_TRANSICIONES_VALIDAS` (p. ej. volver a
`GENERATED` si se rechaza en Recepción como `RETURNED`), nunca creando otra factura
ni reservando otro secuencial. Me detengo aquí — no genero XML, no firmo, no llamo
a `celcer.sri.gob.ec` en este paso.

## 5. Garantías de que esto no afecta datos existentes

- Spreadsheet distinto (ID distinto) al de Producción — cero superposición de filas,
  sea Opción A o B.
- Proyecto de Apps Script distinto, vinculado únicamente a la copia de pruebas.
- `migrarModuloFiscal` es aditivo y solo opera sobre 5 nombres de hoja fiscales
  específicos — nunca `UPDATE`/`DELETE` sobre datos existentes de otras hojas.
- `GAS_URL`/`FISCAL_SERVICE_TOKEN` se configuran solo en Preview de Vercel; el
  entorno Production sigue intacto y apuntando a su Spreadsheet/Apps Script reales.
- Nada de este mecanismo llama al SRI ni a ningún servicio externo — es 100%
  interno a Google Sheets.

## 6. Qué sigue después de validar esto

Con el mecanismo real confirmado, el pre-flight (`scripts/preflight-sri-pruebas.mjs`)
seguiría funcionando exactamente igual para la construcción/firma/validación del
XML — solo que el secuencial que se le pase ya no sería "propuesto sin reservar",
sino el que devolvió `reservarSecuencialFiscal` en el paso 4. Eso no requiere ningún
cambio adicional en el script: ya acepta el secuencial como entrada interactiva.
