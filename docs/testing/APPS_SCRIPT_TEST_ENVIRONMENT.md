# Entorno separado de Apps Script para Preview

La Preview nunca debe apuntar a Apps Script ni Google Sheets de producción.

## Preparación

1. En Google Drive, duplicar el Spreadsheet productivo con un nombre que incluya `PRUEBAS CERTIFICADOS V3`.
2. Desde la copia, abrir **Extensiones → Apps Script** y verificar que el proyecto esté vinculado a la copia.
3. Copiar `apps-script/Code.gs` desde esta rama. No ejecutar `setupInicial()`.
4. En **Configuración del proyecto → Propiedades del script**, crear manualmente:
   - `AUTH_SECRET`: valor aleatorio de al menos 32 caracteres, exclusivo de pruebas;
   - `BOOTSTRAP_ADMIN_PASSWORD`: solo si una copia vacía requiere bootstrap; eliminarla después;
   - la confirmación temporal V3 únicamente durante la migración.
5. Ejecutar primero `migrarCertificadosV3Diagnostico()` y seguir `docs/migrations/CERTIFICATES_V3.md`.

## Web App de pruebas

1. Usar **Implementar → Nueva implementación → Aplicación web**.
2. Ejecutar como el propietario del proyecto de pruebas.
3. Limitar el acceso a las cuentas autorizadas por la empresa.
4. Guardar la URL `/exec` de pruebas como `GAS_URL` del entorno **Preview** de Vercel; no reemplazar Production.
5. Configurar en Preview `VITE_DEPLOYMENT_ENV=preview`, `VITE_PUBLIC_APP_URL` con la URL HTTPS de esa Preview y el modo visual de aval autorizado.

## Cuentas y datos ficticios

Crear exclusivamente cuentas ficticias con rol `admin`, `vendedor` y `aval`. Probar login, permisos, reporte/verificación de pago, emisión, descarga auditada, anulación, reemisión, QR histórico, QR vigente y aval. No copiar teléfonos, identificaciones, correos ni certificados reales.

## Pruebas manuales de API

Desde la Preview comprobar `login`, `getInscripciones`, `emitirCertificado`, `registrarArtefactoCertificado`, `solicitarDescargaCertificado`, `confirmarDescargaCertificado`, `anularCertificado`, `reemitirCertificado` y `verificarCertificado`. Revisar las hojas `AuditoriaCertificados` y `DescargasCertificados`: ninguna descarga debe carecer de solicitud y resultado o permanecer pendiente sin explicación.

Al finalizar, exportar evidencias sin secretos, eliminar datos ficticios conforme a la política interna y conservar la copia de pruebas para regresión. No probar en producción.

