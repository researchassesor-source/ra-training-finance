# Migración controlada de certificados V3

Esta migración prepara versionado, hash, artefactos inmutables, anulación, reemisión y auditoría de descargas. No debe ejecutarse primero en producción ni mediante `setupInicial()`.

## Alcance

La migración revisa `Inscripciones` y prepara `Certificados`, `AuditoriaCertificados` y `DescargasCertificados`. Solo agrega hojas o encabezados ausentes. No renombra estados históricos, no completa datos, no reemplaza fórmulas y no sobrescribe celdas existentes.

Los certificados históricos sin `CertificateVersion` se interpretan en tiempo de ejecución como versión 1. Los estados equivalentes son: `issued` → `emitido`, `sent` → `enviado`, `voided` → `anulado` y `reissued` → `reemitido`.

## Ejecución obligatoria en pruebas

1. Duplicar el Spreadsheet y el proyecto Apps Script.
2. Anotar el ID de la copia y conservar el respaldo sin editar.
3. Copiar el `Code.gs` de esta rama al proyecto de pruebas.
4. Ejecutar `migrarCertificadosV3Diagnostico()`.
5. Guardar el JSON del registro de ejecución.
6. Corregir antes de aplicar cualquier código duplicado, emitido sin código/fecha o estado inconsistente.
7. En Script Properties crear temporalmente `CERTIFICATES_V3_MIGRATION_CONFIRMATION` con la frase exacta indicada por el propio código.
8. Ejecutar una sola vez `migrarCertificadosV3Aplicar()`.
9. Eliminar inmediatamente esa propiedad de confirmación.
10. Volver a ejecutar el diagnóstico y comprobar que no falten columnas, que el conteo de fórmulas sea idéntico y que los registros no hayan cambiado.
11. Ejecutar la aplicación una segunda vez en la copia para verificar idempotencia: ninguna columna debe agregarse.

No se debe ejecutar `setupInicial`, `migrarInscripcionesCertificadosV2` ni otra migración en este procedimiento.

## Criterios de detención

Detener la publicación si aparecen códigos duplicados, certificados emitidos sin metadatos mínimos, fórmulas distintas antes/después, estados desconocidos o registros señalados en `certificadosQuePodrianRomperse`. El diagnóstico no repara esos casos automáticamente.

## Rollback

La reversión es restaurar la copia completa tomada antes de la migración y volver a seleccionar la versión anterior del Apps Script de pruebas. No se deben borrar columnas manualmente de una hoja parcialmente migrada. En producción se repetirá este protocolo únicamente después de aprobar la Preview aislada y con autorización formal.

