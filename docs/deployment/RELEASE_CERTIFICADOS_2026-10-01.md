# Publicación controlada de Finance: instituciones y certificados

Esta guía acompaña la versión con ficha maestra institucional, avales y firmas oficiales v3. No equivale a una certificación de producción: registrar la evidencia de cada paso antes de anunciar el cierre.

## Archivos que se publican

- Apps Script: `apps-script/Code.gs` → archivo **Código.gs** del proyecto vinculado al Spreadsheet. `Fiscal.gs` no cambia en este release.
- Web/API: commit aprobado en `main` → despliegue Production de Vercel.
- Rúbricas: los PNG privados preparados a partir de las firmas autorizadas se cargan **desde el panel de administración** en Servicios → Firmas y plantilla de certificados → edición v3. Nunca se añaden al repositorio.
- ITSAL: el PDF `CREACIÓN ITSAL.pdf` se adjunta a la ficha de ITSAL como **resolución institucional**. La resolución de creación no se debe registrar como convenio, licencia de uso del aval, ni firma de autoridad.

## Secuencia segura

1. Conservar copia identificable del Spreadsheet y una versión recuperable del Apps Script actual. Anotar commit y versión web anteriores.
2. Ejecutar el diagnóstico de `docs/migrations/CERTIFICATES_V3.md` en una copia de pruebas y revisar las anomalías. Aplicar la migración allí solo si el diagnóstico lo permite; comprobar idempotencia y fórmulas.
3. Repetir el diagnóstico en la hoja productiva. Si aparecen duplicados, estados inconsistentes, emitidos sin código/fecha o fórmulas que cambian, detener la publicación. No ejecutar `setupInicial()` ni reparar datos automáticamente.
4. Copiar `apps-script/Code.gs`, guardar y crear una **nueva versión** de la implementación web existente. Confirmar que la web sigue apuntando al mismo `/exec` productivo.
5. Publicar el commit aprobado en Vercel Production. Esperar el resultado del despliegue; no considerar suficiente que GitHub acepte el push.
6. En Instituciones, revisar si ITSAL ya tiene ficha y convenio activos; reutilizarlos, sin duplicar. Registrar la resolución de creación como documento privado. Confirmar que la ficha dispone del logotipo oficial, la autoridad vigente habilitada para firmar, su propia firma auténtica y el código externo del aval antes de emitir. Las firmas de Edison/Alexandra son de R.A. Training, no sustituyen la firma institucional de ITSAL.
7. En Servicios → Firmas y plantilla, cargar los dos PNG v3 de R.A. Training, cotejar visualmente sus trazos con los originales y su mismo tono; revisar un PDF de prueba antes de activar v3. No reemplazar los PDF v2 ni reemitir históricos por este motivo.
8. Hacer smoke test con cuentas autorizadas: login, roles, listado institucional, inscripciones, servicio, pago, facturación, emisión/descarga de un documento controlado, QR, auditoría y lectura de un PDF histórico. Evitar enviar correos/WhatsApp reales de prueba.
9. Registrar el resultado, versión Apps Script, commit, hash de los PDF comprobados y cualquier pendiente. Anunciar cierre únicamente cuando todos los pasos aplicables estén verificados.

## Criterio de rollback

Si la web falla, restaurar la versión web anterior. Si falla Apps Script, volver a la implementación previa. Si se aplicó una migración a la hoja y cambió información existente, restaurar la copia íntegra de la hoja; no borrar manualmente columnas o filas. No emitir certificados nuevos durante una reversión.
