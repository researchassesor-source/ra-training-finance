# Seguridad

## Controles implementados

- localhost, CORS limitado y rol admin local.
- modo demo rechazado en `production` y desde host externo.
- encabezados de seguridad, límite de cuerpo e IDs de correlación.
- secretos redactados en logs; no se registra contraseña, llave ni certificado.
- `.env.*`, certificados, llaves, `certs/`, `secrets/` y `fiscal-service/var/` ignorados.
- configuración pública enmascara RUC, teléfono y correo cuando la bandera de evidencia está activa.
- almacenamiento evita path traversal y nombres arbitrarios.
- idempotencia y máquina de estados para acciones fiscales.
- conexión SRI doblemente bloqueada antes de `fetch`, DNS o socket.
- PKCS#12 rechaza extensión, archivo, contraseña, vigencia e incompatibilidad llave/certificado.

## Contrato futuro de sesión

La aplicación deberá entregar usuario, rol, token de sesión validado server-side, permisos (`fiscal.read`, `fiscal.draft`, `fiscal.sign`, `fiscal.credit-note`, `fiscal.sequence`, `fiscal.configure`) e ID de correlación. El rol vendedor no puede verificar, firmar, emitir nota ni configurar secuenciales.

## Pendiente

MFA, gestor de secretos, TLS/red privada, RBAC server-side corporativo, almacenamiento cifrado, rotación, monitoreo, backups y pruebas de penetración.

El audit del servicio fiscal quedó en cero vulnerabilidades. El proyecto raíz conserva 8 hallazgos heredados (1 bajo, 4 moderados, 2 altos y 1 crítico), principalmente en jsPDF, Vite y React Router. Requieren una actualización mayor separada con regresión de certificados, rutas y build; no se aplicó `npm audit fix --force`.

## Controles específicos de Preview

- Requiere simultáneamente módulo habilitado, bandera de demo, contexto explícito `preview`, host no oficial y sesión normal de administrador.
- Una configuración accidental de demo en producción queda bloqueada y no cae al adaptador HTTP.
- El adaptador Preview no usa `fetch` ni importa código Node o `fiscal-service`.
- La clave `ra-training:fiscal-preview:v1` contiene solo información ficticia; no incluye sesión, credenciales, tokens, certificados o datos reales.
- El reinicio elimina únicamente esa clave y conserva la sesión y los demás datos de la aplicación.
- `localStorage` y su coordinación entre pestañas son suficientes solo para demostración, no para secuencias productivas.
- XML y PDF incluyen advertencias inequívocas de falta de validez tributaria y conexión SRI.
