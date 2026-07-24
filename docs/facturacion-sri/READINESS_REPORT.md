# Informe de preparación

`FiscalReadinessService` organiza la evaluación en requisitos para certificación, requisitos previos a producción e infraestructura recomendada. Revisa datos tributarios, numeración, catálogo, firma, adaptador SRI, autenticación, persistencia segura, archivos privados, respaldos, auditoría, correo y recuperación.

## Resultado local

- Datos básicos del emisor: cargados privadamente.
- Establecimiento/punto: parciales.
- Dirección, obligación y secuencial: requieren confirmación.
- Catálogo: requiere revisión tributaria.
- Firma: requiere certificado.
- Persistencia fiscal segura, autenticación, almacenamiento privado y correo: pendientes o bloqueados.
- PostgreSQL: recomendado por integridad y concurrencia, no exigido como requisito tributario.
- Gateway: preparado y deshabilitado.
- Certificación: pendiente.

No se calcula un porcentaje arbitrario. El botón oficial usa los bloqueadores devueltos por el servicio y permanece deshabilitado.
