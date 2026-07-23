NO APTO PARA PRODUCCIÓN

# Preparación para producción

La prueba local demuestra arquitectura y comportamiento, no cumplimiento certificado. Todos los puntos siguientes deben cerrarse con evidencia antes de un despliegue.

## Bloqueadores tributarios

- [ ] Datos tributarios institucionales completos y verificados.
- [ ] Matriz de impuestos, descuentos y formas de pago aprobada por contador.
- [ ] Firma XAdES-BES real compatible, válida y revisada.
- [ ] Certificación/autorización aplicable completada.
- [ ] Pruebas oficiales en ambiente SRI con casos positivos y negativos.
- [ ] Revisión legal/tributaria de factura, nota de crédito, anulación, conservación y RIDE.
- [ ] Conciliación con secuencias del sistema de facturación actual.

## Bloqueadores técnicos

- [ ] PostgreSQL productivo administrado, alta disponibilidad y migraciones probadas.
- [ ] Almacenamiento productivo cifrado, inmutable cuando aplique y con controles de acceso.
- [ ] Gestor de secretos/HSM; la clave privada nunca debe llegar a Git, base o logs.
- [ ] Servicio fiscal desplegado en infraestructura separada con TLS y red restringida.
- [ ] Autenticación corporativa, MFA administrativo y RBAC en API.
- [ ] Cola/polling con backoff, rate limit, timeouts, circuit breaker y recuperación.
- [ ] Monitoreo, alertas, métricas, trazas y correlación extremo a extremo.
- [ ] Respaldos cifrados y restauración probada con RPO/RTO aprobados.
- [ ] Plan de continuidad, incidentes, rotación y vencimiento de certificado.
- [ ] Escaneo de dependencias, SAST/DAST, pruebas de penetración y revisión de código.
- [ ] Eliminación del adaptador de rol local y del login ficticio del artefacto productivo.
- [ ] Feature flag, despliegue gradual y rollback fiscal probados.

## Calidad pendiente

- [ ] Ejecutar migración, seed y concurrencia sobre PostgreSQL real local/CI; Docker no estuvo disponible en esta ejecución.
- [ ] Añadir pruebas de compatibilidad con el firmador seleccionado.
- [ ] Probar tamaños límite, lotes, reloj, expiración, cortes de red y recuperación.
- [ ] Revisar accesibilidad completa y descarga en navegadores objetivo.
- [ ] Confirmar plantilla RIDE y XML con responsable tributario.
- [ ] Resolver advertencias de React Router durante la actualización futura (las banderas de compatibilidad ya se activaron en desarrollo).
- [ ] Clasificar y remediar hallazgos de seguridad heredados del frontend; `npm audit` reportó 1 bajo, 4 moderados, 2 altos y 1 crítico.

## Condición de salida

Solo cambiar este estado cuando dirección, responsable tributario, seguridad y QA firmen el checklist; las pruebas del ambiente oficial estén archivadas; la restauración haya sido ensayada; y el servicio real use identidad, firma, secretos, base y almacenamiento productivos separados del mock.
