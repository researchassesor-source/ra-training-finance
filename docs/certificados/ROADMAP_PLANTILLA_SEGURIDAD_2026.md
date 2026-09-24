# Certificados de seguridad 2026 — estado y controles

## Alcance implementado

- La plantilla visual v2 utiliza el fondo de seguridad facilitado por Dirección y mantiene el código/QR de verificación por certificado.
- El tipo del certificado de **participante** se configura por servicio: aprobación, asistencia, participación o capacitación. Se congela al emitir; cambiar el servicio no modifica un PDF histórico.
- Las fichas de capacitadores son datos profesionales independientes de las inscripciones. Un servicio puede vincular una ficha y el administrador puede ejecutar un preflight **de solo lectura** para revisar nombre, identificación, semblanza, horas y fechas. Ese preflight no crea una inscripción, certificado, código, PDF ni archivo en Drive.
- La emisión de la plantilla v2 y de tipos distintos de aprobación continúa bloqueada. Los certificados históricos conservan su versión, hash y artefacto original.

## Separación de sujetos y tipos

| Sujeto | Tipos previstos | Fuente de datos |
| --- | --- | --- |
| Participante | Aprobación, asistencia, participación, capacitación | Inscripción + servicio |
| Profesional | Capacitador; extensible a ponente, expositor, facilitador, moderador y coordinador | Ficha profesional + vinculación explícita al evento |
| Avalado por tercero | El tipo de participante correspondiente, con aval externo aprobado | Certificado R.A. + autorización/código de la entidad |

No se debe representar a un capacitador como alumno ni asignarle un tipo de participante. Tampoco se debe conceder automáticamente un rol profesional porque su nombre aparezca en texto libre del servicio. Los roles futuros requieren una relación explícita persona–evento–rol, con control administrativo y evidencia de participación antes de emitir.

## Condiciones para activar emisión profesional

1. Incorporar las dos firmas **auténticas** autorizadas por Dirección, con autorización de uso y resguardo privado. No emplear las firmas antiguas generadas por IA ni una rúbrica de prueba.
2. Implementar un registro de certificados profesionales separado de `Inscripciones`/`Certificados`, con instantánea inmutable de identidad, rol, curso, horas, fechas, plantilla y versión.
3. Extender verificación pública, auditoría, anulación/reemisión y archivo privado con hash SHA-256 a ese registro; probar colisiones de códigos, idempotencia y permisos.
4. Aprobar visualmente el PDF de prueba con las firmas reales y activar la nueva versión de plantilla de manera explícita; no reemplazar artefactos ya emitidos.

## Aval institucional

No incorporar nombre, sello, firma ni código de un tercero en el PDF de R.A. Training hasta recibir convenio/autorización, texto y activos aprobados. El rol externo debe poder confirmar el aval, pero no editar datos académicos ni sustituir PDFs ya emitidos. El flujo avalado y el pasaporte de aprendizaje quedan separados de esta activación; el pasaporte se hará al final cuando Dirección defina sus reglas de niveles y premios.
