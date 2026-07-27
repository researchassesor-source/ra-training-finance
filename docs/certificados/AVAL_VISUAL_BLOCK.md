# Bloque visual de aval

`VITE_CERTIFICATE_AVAL_VISUAL_MODE` admite `pending` y `configured`.

- `pending` es el valor predeterminado. En Development/Preview muestra: “Aval confirmado — información institucional pendiente de plantilla final”. En Production bloquea la generación de certificados con aval.
- `configured` exige entidad, referencia/código y `AvalTextoConfirmado`. El logo solo se muestra cuando fue entregado como imagen válida; nunca se inventa ni se obtiene de Internet.

El bloque ocupa un área separada de nombres, curso, firmas y QR. Antes de activar `configured` en Production, la institución debe aprobar por escrito el texto, el uso del nombre, el código y cualquier logo. Este desarrollo no implica aval del Ministerio de Trabajo ni de otra entidad.

