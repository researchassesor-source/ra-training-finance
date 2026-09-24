# Certificados de seguridad v2 — estado de preparación

## Alcance desarrollado

- La plantilla `ra-security-2026-v2` usa el fondo corporativo 1600 × 900 y conserva la composición de la referencia: identidad del emisor, RUC y expediente, marca de agua, título, tipo de certificado, datos académicos, QR, código único, sello R.A. Training, firmas y microtexto de trazabilidad.
- El tipo de certificado del participante se configura por servicio: aprobación, asistencia, participación o capacitación. La versión y el PDF de cada emisión quedan congelados; las descargas históricas no se regeneran con la plantilla nueva.
- El capacitador tiene ficha vinculada y certificado profesional separado de la inscripción de alumnos, con preflight, emisión idempotente, código único, verificación pública, archivo PDF privado, SHA-256, anulación y reemisión versionada.
- El aval ITSAL utiliza otro registro y otra plantilla (`ra-itsal-security-2026-v1`), sin sustituir el certificado ordinario. El usuario institucional confirma el aval y registra su código; solo administración emite el segundo documento. El QR público muestra código R.A. y código ITSAL; el PDF se archiva en Drive privado con SHA-256 y el correo toma exclusivamente ese archivo. La anulación y reemisión conservan versiones previas verificables; la versión anterior pasa a sustituida solo cuando se archiva la nueva. La acción de envío es explícita e idempotente; un estado incierto obliga a revisión humana para evitar duplicados.
- Las firmas se cargan como PNG por administración, se guardan en Drive privado con SHA-256 y no se incorporan al repositorio. La plantilla v2 permanece apagada hasta el registro de ambas firmas y una activación explícita. El administrador afirma la autenticidad y el permiso de uso; el sistema no puede demostrar por sí mismo que una imagen sea una rúbrica auténtica.

## Pendiente antes de activar o emitir

1. Obtener de Mgs. Edison Bonifaz y Mgs. Alexandra Villagómez sus rúbricas auténticas en PNG y autorización para usarlas en estos certificados. Revisar visualmente el PDF final ya con esas rúbricas y aprobar la plantilla.
2. Publicar y probar `Code.gs` y la aplicación web como una sola versión compatible, sin emitir certificados mientras una mitad esté desactualizada. La carga de firmas y activación son acciones administrativas explícitas; no se ejecutan por una migración automática.
3. Verificar contra el entorno real que Drive privado, auditoría, enlace QR, recuperación SHA-256 y descarga operen con un certificado nuevo autorizado. No usar ni alterar certificados históricos para esta prueba.

## Aval ITSAL — no confundir con firma R.A. Training

La publicación aportada por el usuario muestra la firma de un convenio entre ITSAL y Research Assessor & Training. La [web oficial de ITSAL](https://itsal.edu.ec/sitio_web/public/QuienesSomos.html) identifica al Instituto Superior Tecnológico Internacional San Luis y su código IES 3063. El recurso `itsal-official-logo.png` se obtuvo de `https://itsal.edu.ec/sitio_web/imagenes/ITSAL.png`; es el logotipo público, **no una rúbrica ni un sello criptográfico**. El usuario afirmó que la empresa tiene autorización para utilizarlo en los certificados conjuntos. La aprobación de cada alumno sigue exigiendo código institucional ingresado por el rol ITSAL; la publicación pública no equivale a aprobación individual.

La plantilla conjunta se mantiene inactiva mientras falten las dos firmas oficiales R.A. Training y la activación administrativa. No debe cargarse una rúbrica sintética para sortear ese bloqueo. El pasaporte de aprendizaje queda fuera de esta entrega, según la prioridad indicada en la reunión.

## Compatibilidad y límites

- La versión `ra-canva-2026-v1` y sus PDF ya emitidos permanecen intactos.
- Un PDF ITSAL archivado nunca se sobrescribe. Una corrección que requiera **otro código ITSAL** debe confirmarse de nuevo por la institución antes de emitirla; la reemisión administrativa disponible conserva el código ITSAL ya aprobado. No se debe editar la fila manualmente.
- El PDF v2 se construye en el navegador del administrador autenticado porque el generador actual usa jsPDF; las firmas se reciben temporalmente allí para esa operación y no se muestran a roles no administrativos. Se guardan en Drive privado en reposo. No presentar esta arquitectura como una firma criptográfica del PDF ni como autenticación biométrica.
- La activación v2 requiere una revisión humana del diseño y de las rúbricas. No equivale a autorización de una institución externa.
