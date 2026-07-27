# Permisos de certificados

| Acción | Administrador | Vendedor | Aval | Público |
|---|:---:|:---:|:---:|:---:|
| Consultar estado resumido | Sí | Solo propios | Solo asignados | No |
| Verificación mediante QR | Sí | Página pública | Página pública | Sí |
| Ver código administrativo | Sí | No | No | Solo identificador público de un emitido |
| Emitir/generar PDF oficial | Sí | No | No | No |
| Descargar PDF oficial | Sí | No | No | No |
| Ver/descargar QR independiente | Sí | No | No | No |
| Compartir o abrir WhatsApp del certificado | Sí | No | No | No |
| Enviar por correo | Sí | No | No | No |
| Envío masivo | Sí | No | No | No |
| Cambiar estado de entrega | Sí | No | No | No |
| Consultar auditoría | Sí, solo lectura | No | No | No |
| Gestionar aval | Sí | No | Solo su institución | No |

## Defensa en profundidad

- Frontend: las capacidades derivan del usuario autenticado y las acciones administrativas no se renderizan para otros roles. Los modales de entrega también fallan cerrados.
- Backend: `requireCertificateAdmin` vuelve a validar la identidad obtenida de la sesión; no acepta un rol enviado por el cliente.
- Datos: el vendedor recibe un resumen sin código, usuario emisor, fechas de entrega ni referencias administrativas del aval.
- Auditoría: los intentos de acceso administrativo rechazados se registran sin tokens ni contraseñas.
- No existe una ruta pública al PDF oficial. La ruta pública solo verifica los datos mínimos del certificado emitido.

La plantilla continúa descargándose en el navegador del administrador. La autenticidad oficial depende del registro de emisión y de la verificación QR; una futura arquitectura de almacenamiento de PDFs deberá mantener este mismo control en el servidor.
