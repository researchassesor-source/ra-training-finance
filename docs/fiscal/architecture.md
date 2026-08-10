# Facturación electrónica SRI + PayPhone — arquitectura y hoja de ruta

Estado: en construcción. Rama `feature/sri-integration-production-ready`, worktree aislado en
`ra-training-finance-sri/`. Base: `main` en `2795fc1`.

## 1. Fuentes y conflicto detectado (leer antes de tocar XML/XSD)

Se recibieron dos documentos de referencia:

- `Prompt_Maestro_Definitivo_RA_Training_Finance_v3_2026-08-04.txt` — dice Ficha Técnica SRI
  **versión 2.34**, julio 2026.
- `Ficha_Maestra_Final_SRI_RA_Training_Finance_2026.docx` (v2.0, 04/08/2026, más reciente) — dice
  Ficha Técnica SRI **versión 2.33**, julio 2026, y añade el dato concreto **XML de factura 2.1.0**.

Los dos documentos no coinciden en el número de versión de la ficha técnica. Regla del propio
prompt maestro (sección 8): no implementar desde memoria, reabrir la fuente oficial y comparar.
**Antes de escribir el generador de XML/XSD (Fase 3) hay que reabrir
https://www.sri.gob.ec/facturacion-electronica, descargar la ficha vigente y el XSD, calcular su
SHA-256 y registrar versión/fecha/hash en `docs/fiscal/sri-sources.md`.** No se asume 2.33 ni 2.34
hasta esa verificación en vivo.

Otras dos diferencias resueltas con criterio (documento v2.0 es el más nuevo y más específico):

- **Correo**: la Ficha Maestra dice proveedor elegido = **Resend** directamente (no SMTP-cPanel
  como primario). El Prompt Maestro V3 proponía SMTP-cPanel primero y Resend como fallback. Se
  adopta Resend como proveedor por defecto vía el mismo patrón de adaptador desacoplado
  (`EmailProvider`) que ya pedía el Prompt Maestro, dejando SMTP-cPanel como adaptador alternativo
  ya construido pero no activo por defecto. Ninguno de los dos es urgente ahora (Fase 8).
- **Banco de transferencia**: "Banco Pichincha" aparece en el Prompt Maestro V3 como dato
  confirmado, pero la Ficha Maestra v2.0 lo marca explícitamente como **PENDIENTE DE CONFIRMACIÓN
  antes de mostrarlo a clientes**. Se sigue el criterio más conservador: el nombre del banco queda
  detrás de un flag de configuración y no se muestra en el checkout hasta que Jefatura lo confirme
  por escrito. El número de cuenta y titular sí están confirmados en ambos documentos.

## 2. Decisión de arquitectura para el backend fiscal

No existe hoy ningún backend Node real — solo `api/proxy.js`, un proxy CORS delgado hacia Google
Apps Script (`GAS_URL`). El firmado XAdES-BES, las llamadas SOAP al SRI y el sondeo asíncrono de
autorización necesitan Node real (Apps Script no firma XML con P12 de forma confiable).

**Decisión (confirmada con el usuario):**

- Lógica de negocio server-only vive en `lib/fiscal/` (raíz del repo), **fuera** de `api/`.
  Vercel convierte en endpoint HTTP público *cualquier* archivo `.js/.ts` bajo `api/**`
  (glob `api/**/*.+(js|mjs|ts|tsx)`, verificado con la documentación oficial de Vercel) — no hay
  convención de "prefijo `_` ignorado" en el builder zero-config que usa este proyecto. Meter
  lógica interna directamente en `api/` la expondría sin querer como ruta pública no autenticada.
  Por eso: `api/fiscal/*.js` serán únicamente handlers HTTP delgados que importan de `lib/fiscal/`.
- El sondeo periódico de autorización SRI (esperar, reconsultar con backoff hasta AUT/NAT) lo
  dispara un **time-driven trigger de Google Apps Script** (gratis, cada 1-5 min) que llama a
  `POST /api/fiscal/poll`. Se descartó Vercel Cron porque en el plan Hobby el mínimo es 1 vez al
  día — insuficiente — y un servicio Node aparte (Render/Railway/Fly) se descartó por añadir
  infraestructura nueva que pagar y mantener sin necesidad.
- Persistencia: Google Sheets, igual que el resto del sistema (no Postgres). El directorio
  `fiscal-service/` no rastreado que existía en el árbol de trabajo solo contenía `dist/` compilado
  y `node_modules/` sin ningún `src/` — no había código fuente que evaluar ni reutilizar. Se deja
  intacto y sin rastrear en Git a pedido del usuario, pero no es la base de este trabajo.

## 3. Patrones existentes a reutilizar (auditados en `apps-script/Code.gs` y `src/`)

- **Secuenciales atómicos**: mismo patrón que `conBloqueoCertificados` (`LockService.getScriptLock`,
  ~L1918) — usarlo para reservar serie+secuencial+clave de acceso sin colisión.
- **Auditoría obligatoria**: mismo patrón que `registrarAuditoriaCertificado`/hoja
  `AuditoriaCertificados` (L260) — falla la operación completa si el registro de auditoría falla.
- **Máquina de estados con versionado**: mismo patrón que emitir/anular/reemitir certificado
  (`emitirCertificadoBajoBloqueo` L2162, `anularCertificado` L2263 con `confirmacion==='ANULAR'`
  + motivo ≥5 chars, `reemitirCertificado` L2309 crea fila nueva versionada) — se traduce a
  factura DRAFT→SIGNED→AUTHORIZED, con anulación exigiendo el mismo patrón de confirmación
  explícita por string + motivo.
- **Roles**: `AuthContext` deriva `isAdmin/isVendedor/isAval` de `user.rol` (string plano); se
  añade `isAccountingViewer = user?.rol === 'contabilidad'`, un `RequireAccountingViewer` en
  `App.jsx` (mismo molde que `RequireAval`) y un array `accountingLinks` en `Sidebar.jsx`.
- **API desde el frontend**: todo pasa por `src/services/api.js` → `call(action, params, token)`
  → `/api/proxy` → GAS. Las nuevas acciones fiscales que necesiten Sheets se añaden como acciones
  GAS nuevas siguiendo el mismo contrato; las que necesiten firma/SOAP/PayPhone van a
  `api/fiscal/*` en Vercel.
- **PDF/QR**: ya hay `jspdf` + `jspdf-autotable` + `qrcode`/`jsqr` en uso para certificados —
  se reutilizan para el RIDE y su código QR, sin añadir dependencias nuevas.
- **Dinero**: el código existente usa `Number` sin librería decimal. El prompt maestro exige
  enteros en centavos sin redondeo binario — es una desviación deliberada del estilo actual,
  documentada aquí porque no es un patrón a copiar sino a corregir para lo fiscal.

## 4. Fases (orden de ejecución)

0. ✅ Auditoría (repo, ramas, `fiscal-service/`, secretos en historial).
1. ⏳ **Modelo fiscal puro** (en curso): dinero en centavos, clave de acceso 49 dígitos + módulo 11.
   Sin red, sin secretos, 100% testeable localmente.
2. Modelo de datos en Sheets (Facturas, FacturaItems, Pagos, SecuenciaFiscal, AuditoriaFiscal) +
   migración idempotente + acciones GAS de solo backend (reserva de secuencial, transición de
   estado).
3. Generación XML factura + validación XSD (bloqueado por verificación de versión, ver §1).
4. Firma XAdES-BES (requiere el P12 — el usuario lo introduce como secreto, nunca en el chat).
5. Servicios SOAP de recepción/autorización + `api/fiscal/poll` + trigger GAS.
6. Estados y reintentos (idempotencia end-to-end).
7. RIDE (PDF) + almacenamiento (Drive privado).
8. Correo (Resend por defecto, adaptador SMTP disponible).
9. Rol ACCOUNTING_VIEWER + panel.
10. Pagos: transferencia (con banco oculto hasta confirmación) + PayPhone Pruebas.
11. Pruebas end-to-end, documentación, evidencias, Preview, informe GO/NO-GO.

Cada fase se commitea por separado. No hay push ni despliegue sin autorización explícita en el
chat, y ningún secreto (P12, SMTP, PayPhone, Resend) se pide ni se muestra aquí — se indicará el
comando o pantalla exacta para que el responsable lo cargue de forma oculta cuando llegue el
momento.
