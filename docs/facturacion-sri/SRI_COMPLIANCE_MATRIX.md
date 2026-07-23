# Matriz de cumplimiento SRI

Ninguna fila marcada como simulada o local implica certificación. Estados de esta matriz: `IMPLEMENTADO LOCAL`, `IMPLEMENTADO PARCIAL`, `SIMULADO`, `DOCUMENTADO`, `BLOQUEADO`, `REQUIERE CERTIFICACIÓN`, `NO IMPLEMENTADO`.

| Requisito | Fuente oficial | Componente | Estado | Evidencia | Pendiente | Bloqueador | Validación necesaria |
|---|---|---|---|---|---|---|---|
| Clave de acceso de 49 dígitos | Ficha 2.33 | `access-key.ts` | IMPLEMENTADO LOCAL | Vector oficial y tests | Confirmar parámetros reales | Datos del emisor | Contable + certificación |
| Módulo 11 | Ficha 2.33 | `access-key.ts` | IMPLEMENTADO LOCAL | Tests con ejemplos oficiales | Ninguno local | — | Prueba de certificación |
| Secuencial de 9 dígitos | Ficha 2.33 | repositorios | IMPLEMENTADO LOCAL | Concurrencia en memoria; SQL con `FOR UPDATE` | Ejecutar test PostgreSQL | Docker no disponible | Carga concurrente |
| Factura XML 1.1.0 | XSD factura | `builders.ts` | IMPLEMENTADO LOCAL | `xmllint` contra XSD oficial | Validar casos institucionales | Datos tributarios | SRI pruebas |
| Nota de crédito XML 1.1.0 | XSD nota de crédito | `builders.ts` | IMPLEMENTADO LOCAL | Test XSD y flujo | Casuística real | Políticas de devolución | SRI pruebas |
| Identificación y datos del emisor | Ficha/XSD | fixtures/config | SIMULADO | Emisor marcado placeholder | Cargar y verificar datos | RUC y datos faltantes | RUC institucional |
| Cálculo decimal y redondeo | Ficha/XSD | `money.ts` | IMPLEMENTADO LOCAL | Tests unitarios | Revisión contable | Políticas fiscales | Contador |
| Tarifas de IVA | Tabla 17, Ficha 2.33 | catálogo | DOCUMENTADO | Catálogo API | Elegir tarifa por servicio | Criterio tributario | Contador/SRI |
| Formas de pago | Tabla 24, Ficha 2.33 | catálogo | IMPLEMENTADO PARCIAL | Endpoint/formulario | Mapeo operativo real | Reglas del negocio | Contador |
| Validación XSD | XSD oficiales | `validator.ts` | IMPLEMENTADO LOCAL | `xmllint`, pruebas | Empaquetar validador | Runtime futuro | QA |
| Firma XAdES-BES | Ficha 2.33 | interfaz de firma | NO IMPLEMENTADO | Mock inequívoco | Firmador real y custodia | Certificado y proveedor | REQUIERE CERTIFICACIÓN |
| Recepción offline | Ficha 2.33 | `SriGateway` | SIMULADO | Escenarios y tests | Adaptador SOAP real | Autorización de conexión | REQUIERE CERTIFICACIÓN |
| Consulta de autorización | Ficha 2.33 | `SriGateway` | SIMULADO | Autorizado/no autorizado/procesando | Polling real | Ambiente SRI | REQUIERE CERTIFICACIÓN |
| Reintentos sin duplicar | Ficha 2.33 | servicio + idempotencia | IMPLEMENTADO LOCAL | estados, hashes y tests | Política de backoff/colas | Operación futura | Pruebas de falla |
| XML autorizado separado | Ficha/XSD | almacenamiento | SIMULADO | archivo envuelto como autorización simulada | Respuesta real | SRI | REQUIERE CERTIFICACIÓN |
| RIDE | Portal/ficha SRI | `ride-generator.ts` | IMPLEMENTADO PARCIAL | PDF y marca de agua | Revisión tributaria/formato | Datos y autorización | Contador/SRI |
| Conservación e integridad | Normativa por validar | contrato storage/audit | DOCUMENTADO | hashes/eventos locales | Política y almacén productivo | Legal/infraestructura | Auditoría |
| Anulación oficial | Guía SRI marzo 2025 | análisis | NO IMPLEMENTADO | fuente archivada | Flujo, permisos y plazos | Decisión operativa | SRI/contador |
| Correo del comprobante | Reglas por validar | mailer local | SIMULADO | vista previa de archivo | SMTP/API, consentimiento | Canal institucional | Legal/seguridad |
| Ambiente de pruebas SRI | Portal SRI | no conectado | BLOQUEADO | conexiones deshabilitadas | Credenciales y aprobación | Certificación | REQUIERE CERTIFICACIÓN |
| Producción SRI | Portal SRI | no conectado | BLOQUEADO | guardas de configuración | Todo el readiness | Múltiples | REQUIERE CERTIFICACIÓN |
