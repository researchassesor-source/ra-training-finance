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
