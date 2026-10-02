# Finance — cierre técnico previo a publicación (1 de octubre de 2026)

Este documento complementa, no reemplaza, la auditoría de `docs/audits/VERIFICACION_FINAL_FINANCE_2026-10-01.md`. La auditoría original describía el commit `da57843`; los defectos aquí indicados se corrigieron después de ese corte. **No afirma que producción esté al 100 %.**

## Cambios preparados

- La reemisión del avalado toma la plantilla institucional, autoridad vigente, firma institucional verificable y firmante RA actuales; V1, su PDF, su código y el importe confirmado permanecen intactos. Una V2 pendiente no cambia la vigencia de V1 hasta archivar el PDF nuevo.
- La corrección excepcional de identificación en un aval confirmado es exclusiva de administración. Exige cédula/RUC/pasaporte/otro documento válido, identificación anterior exacta, motivo, confirmación, PDF avalado archivado, bloqueo de concurrencia, verificación de persistencia y auditoría con reversión si falla. No reescribe facturas, documentos ni cálculo económico previos.
- Un PDF normal o avalado cuyo snapshot no coincide con la identificación actual no puede enviarse por correo como versión corregida. Las descargas históricas siguen disponibles. El panel avisa qué versión reemitir.
- El reporte administrativo de certificaciones cuenta personas únicas por inscripción, PDFs normales, PDFs avalados, reemisiones y anulaciones. Solo cuenta archivos oficiales con huella y referencia privada; excluye borradores y, del rango seleccionado, documentos sin fecha. Tiene CSV descargable y no aparece al rol contador.
- En móvil, el flujo normal de descarga evita abrir una pestaña de vista previa vacía antes de recibir el PDF. Esto es una mitigación; no prueba que el incidente original esté resuelto en todos los dispositivos.

## Verificación local

- Suite completa: 80 archivos, 924 pruebas aprobadas tras los cambios de código y tests.
- Build Vite: correcto. Persiste una advertencia de bundle grande, no un error de compilación.
- `git diff --check`: sin errores de espacios.
- Los tests usan datos y firmas sintéticas; no constituyen emisión real ni autorización SRI.

## Secuencia obligatoria para producción

1. Copiar el contenido completo de `apps-script/Code.gs` a **Código.gs** del proyecto Apps Script correcto, guardar y crear una nueva versión de la implementación web **existente**. No ejecutar `setupInicial()` ni reemplazar `Fiscal.gs` por este cambio.
2. Antes de tocar la hoja real, guardar copia del Spreadsheet y ejecutar el diagnóstico de `docs/migrations/CERTIFICATES_V3.md`. Detenerse ante duplicados o inconsistencias; nunca corregir históricos automáticamente.
3. Publicar el frontend/API de este mismo cambio en Vercel Production **después** de publicar Apps Script; el frontend nuevo usa dos acciones que la versión anterior de `Código.gs` no conoce. Verificar el despliegue efectivo, no solo el push.
4. Revisar en el panel la configuración real de ITSAL: ficha, convenio legítimo vigente, autoridad habilitada, firma propia autorizada y verificable, logo/sello cuando correspondan, resolución cargada como documento separado. La firma RA no reemplaza la de ITSAL.
5. Con una inscripción controlada y autorización para la prueba: abrir normal V1 y avalado V1, corregir una identificación de prueba, comprobar que no se puedan enviar los PDF viejos, reemitir normal y avalado V2, archivar ambos, verificar códigos/QR, descargar V1 y V2, revisar auditoría y confirmar que el valor aval no cambió. No usar una cédula con checksum inválido.
6. Validar el reporte con el mismo caso: una persona, dos variantes y sus versiones, sin duplicar a la persona. Comparar con las hojas y registrar evidencia.
7. Probar descarga autenticada en un Android/iPhone real, con sesión normal y sesión expirada, y registrar navegador, versión, resultado y mensaje. No declarar cerrado el incidente móvil solo con jsdom.
8. Hacer smoke de pago/factura en entorno controlado con respaldo y sin facturas SRI reales de prueba no autorizadas. Confirmar que pago verificado, ingresos y facturación conservan sus totales.

Si falla la web, restaurar el despliegue anterior. Si falla Apps Script, restaurar su versión previa. No borrar filas, códigos, PDFs o auditoría para «limpiar» una prueba.
