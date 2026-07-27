# Migración de AUTH_SECRET

`Code.gs` ya no contiene un secreto de autenticación ni un fallback. El backend exige `AUTH_SECRET` en Script Properties y falla de forma segura si falta o tiene menos de 32 caracteres.

## Procedimiento

1. Respaldar Spreadsheet, Apps Script, usuarios y sesiones antes de cambiar autenticación.
2. Probar primero en el proyecto separado descrito en `docs/testing/APPS_SCRIPT_TEST_ENVIRONMENT.md`.
3. Generar el secreto con un administrador de contraseñas o CSPRNG; nunca pegarlo en Git, documentación, capturas, chat, logs o variables `VITE_*`.
4. En Apps Script abrir **Configuración del proyecto → Propiedades del script → Agregar propiedad**, usar el nombre `AUTH_SECRET` y guardar el valor de forma manual.
5. Implementar una nueva versión del Web App de pruebas y verificar login correcto, contraseña incorrecta y secreto ausente.
6. Borrar todas las filas de `Sesiones` del entorno intervenido para invalidar sesiones anteriores.

## Rotación y contraseñas existentes

Los hashes de contraseña incorporan `AUTH_SECRET`. Cambiarlo invalida los hashes existentes, por lo que una rotación real requiere un plan simultáneo de restablecimiento y re-hash seguro para todos los usuarios. No rotar en producción sin ese plan. Las sesiones existentes también deben invalidarse expresamente borrando `Sesiones`; el cambio del secreto por sí solo no elimina tokens activos.

`BOOTSTRAP_ADMIN_PASSWORD` es temporal, solo sirve para una inicialización autorizada y debe eliminarse de Script Properties inmediatamente después. El sistema nunca registra su valor.

## Pruebas y rollback

Registrar quién ejecutó la rotación y cuándo, sin registrar valores. Comprobar admin, vendedor y aval. Si falla, restaurar la versión anterior del Apps Script y el secreto anterior desde el gestor seguro, restaurar los hashes respaldados si fueron cambiados e invalidar nuevamente todas las sesiones. Nunca recuperar secretos desde Git.

