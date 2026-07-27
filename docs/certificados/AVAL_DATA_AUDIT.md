# Auditoría de datos del aval

## Fuentes revisadas

| Fuente | Resultado |
|---|---|
| Apps Script y encabezados de Inscripciones | Campos genéricos: institución, estado, referencia, fecha, valor, enlace y código externo. |
| Interfaz de Inscripciones y Avales | Permite seleccionar una institución asociada a un usuario con rol `aval`; no fija una entidad única. |
| Certificado vigente y referencia PNG | No contienen un aval externo confirmado. |
| Canva entregado | No contiene una entidad avaladora adicional ni texto legal confirmado. |
| Sitio institucional | Presenta certificados verificables de R.A. Training, pero no confirma un aval externo específico para esta plantilla. |

## Conclusión

No existe una fuente suficientemente consistente para completar automáticamente el nombre de una entidad avaladora ni un texto legal de aval. El valor actual se conserva dinámico y queda marcado como **requiere confirmación institucional**.

No se añadieron nombres, logos, textos legales, QR externos ni códigos de terceros. El rol `aval` conserva únicamente la gestión de registros asignados a su propia institución.
