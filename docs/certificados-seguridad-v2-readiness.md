# Certificados de seguridad v2 — estado de preparación

## Alcance desarrollado

- La plantilla `ra-security-2026-v2` usa el fondo corporativo 1600 × 900 y conserva la composición de la referencia: identidad del emisor, RUC y expediente, marca de agua, título, tipo de certificado, datos académicos, QR, código único, sello R.A. Training, firmas y microtexto de trazabilidad.
- El tipo de certificado del participante se configura por servicio: aprobación, asistencia, participación o capacitación. La versión y el PDF de cada emisión quedan congelados; las descargas históricas no se regeneran con la plantilla nueva.
- El capacitador tiene ficha vinculada y certificado profesional separado de la inscripción de alumnos, con preflight, emisión idempotente, código único, verificación pública, archivo PDF privado, SHA-256, anulación y reemisión versionada.
- Las firmas se cargan como PNG por administración, se guardan en Drive privado con SHA-256 y no se incorporan al repositorio. La plantilla v2 permanece apagada hasta el registro de ambas firmas y una activación explícita. El administrador afirma la autenticidad y el permiso de uso; el sistema no puede demostrar por sí mismo que una imagen sea una rúbrica auténtica.

## Pendiente antes de activar o emitir

1. Obtener de Mgs. Edison Bonifaz y Mgs. Alexandra Villagómez sus rúbricas auténticas en PNG y autorización para usarlas en estos certificados. Revisar visualmente el PDF final ya con esas rúbricas y aprobar la plantilla.
2. Publicar y probar `Code.gs` y la aplicación web como una sola versión compatible, sin emitir certificados mientras una mitad esté desactualizada. La carga de firmas y activación son acciones administrativas explícitas; no se ejecutan por una migración automática.
3. Verificar contra el entorno real que Drive privado, auditoría, enlace QR, recuperación SHA-256 y descarga operen con un certificado nuevo autorizado. No usar ni alterar certificados históricos para esta prueba.

## Aval externo — no confundir con firma R.A. Training

El flujo existente permite a la institución autorizada confirmar referencia, código y enlace de aval, y prepara un segundo entregable. La emisión visual de un certificado conjunto con sello de ITSAL no debe habilitarse sin convenio/autorización expresa, sello oficial aprobado y reglas de validación del código institucional. Los campos de aval por sí solos no acreditan permiso para colocar un sello ajeno. El pasaporte de aprendizaje queda fuera de esta entrega, según la prioridad indicada en la reunión.

## Compatibilidad y límites

- La versión `ra-canva-2026-v1` y sus PDF ya emitidos permanecen intactos.
- El PDF v2 se construye en el navegador del administrador autenticado porque el generador actual usa jsPDF; las firmas se reciben temporalmente allí para esa operación y no se muestran a roles no administrativos. Se guardan en Drive privado en reposo. No presentar esta arquitectura como una firma criptográfica del PDF ni como autenticación biométrica.
- La activación v2 requiere una revisión humana del diseño y de las rúbricas. No equivale a autorización de una institución externa.
