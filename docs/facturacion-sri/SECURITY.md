# Seguridad del módulo fiscal local

## Modelo de amenazas

Activos futuros: clave privada, certificado, credenciales de infraestructura, datos personales, secuenciales, XML autorizado, RIDE y auditoría. Amenazas: robo de clave, suplantación administrativa, duplicidad, manipulación monetaria, path traversal, inyección, filtración en logs, envío al ambiente equivocado, borrado de evidencia y uso accidental del mock como producción.

## Controles implementados localmente

- La configuración rechaza `FISCAL_LOCAL_DEV_MODE=true` en producción y rechaza cualquier intento de habilitar conexión real al SRI.
- El servidor enlaza `127.0.0.1`, restringe CORS a localhost, no confía en proxy y limita cada cuerpo a 512 KiB.
- Rutas fiscales requieren rol `admin` local, loopback y modo desarrollo. Este encabezado **no es autenticación productiva**.
- Zod valida entradas; el backend recalcula montos con decimales exactos y genera las claves.
- Idempotency-Key obligatoria en creaciones y restricciones únicas previenen duplicados.
- Máquina de estados bloquea saltos no autorizados; cada transición produce un evento.
- Secuencias PostgreSQL usan transacción y bloqueo de fila.
- Almacenamiento local confina rutas, bloquea traversal y separa artefactos por documento.
- Cabeceras: no-sniff, frame deny, no-referrer, no-store y CSP cerrada para la API.
- Logs estructurados redactan autorización, cookies, contraseñas, secretos y tokens; los errores 500 no exponen detalle interno.
- No se incorporaron certificados, P12/PFX, claves, datos reales ni credenciales. `.gitignore` excluye formatos sensibles y `var/`.

## Firma y secretos

`MockXmlSigner` añade un comentario de advertencia y **no realiza criptografía**. No produce `ds:Signature`, XAdES ni validez. El modelo futuro guarda únicamente alias, huella, sujeto, emisor, vigencia y `keyReference`. En producción la clave deberá permanecer en un gestor de secretos/HSM o servicio de firma con mínimo privilegio, acceso auditado, rotación, revocación y alertas de vencimiento.

## Autenticación y autorización pendientes

Reemplazar el encabezado local por identidad corporativa verificada, sesión segura, MFA administrativo, autorización RBAC del lado servidor y auditoría de cambios de privilegios. Deben separarse emisión, corrección, configuración y consulta; ningún vendedor debe emitir ni cambiar estados fiscales sin política aprobada.

## Datos personales y conservación

Los fixtures son falsos. Antes de datos reales se requiere: minimización, cifrado en tránsito/reposo, mascarado, política de acceso, retención tributaria validada, exportación controlada, borrado solo donde sea legal y procedimiento de atención de incidentes. XML y RIDE deben respaldarse de forma cifrada e íntegra; los eventos no deben contener datos sensibles innecesarios.

## Operación, respaldos y rotación pendientes

- Gestor de secretos y rotación ensayada.
- Backups cifrados, restauración probada, RPO/RTO aprobados e inmutabilidad.
- Monitoreo de errores, cola, reintentos, secuencias, expiración de certificado y discrepancias.
- Protección contra abuso, rate limiting, WAF/reverse proxy y TLS administrado.
- Escaneo de dependencias en CI, SAST/DAST y revisión independiente.
- Política de almacenamiento productivo y control de acceso a artefactos.
- Plan de respuesta y continuidad.

## Hallazgos heredados

`npm audit` del frontend reporta vulnerabilidades en el árbol existente. No se aplicó `npm audit fix` porque podría introducir actualizaciones incompatibles fuera del alcance. Deben clasificarse y remediarse en una tarea separada antes de producción. El servicio fiscal se audita por separado en `TEST_REPORT.md`.

## Mínimo privilegio

El futuro proceso fiscal debe usar una cuenta de base dedicada sin rol de superusuario, acceso de solo escritura a su prefijo de objetos, permiso de invocación —no exportación— sobre la clave y salida de red limitada únicamente a endpoints aprobados. Desarrollo, pruebas y producción deben usar cuentas y secretos separados.
