# Matriz de cumplimiento técnico local

| Requisito | Implementación/evidencia | Estado | Bloqueador |
|---|---|---|---|
| Clave 49 dígitos y módulo 11 | `access-key.ts`, pruebas | TERMINADO LOCALMENTE | parámetros reales |
| Factura y nota XML | builders + XSD 1.1.0 | FUNCIONAL CON MOCK | certificación |
| Múltiples detalles/impuestos/pagos | dominio, UI y tests | TERMINADO LOCALMENTE | clasificación contable |
| Firma XAdES-BES | firma efímera verificable y PKCS#12 | PREPARADO PARA CONFIGURACIÓN REAL | certificado institucional |
| Recepción/autorización | SOAP, Base64, parsers y fixtures | PREPARADO PARA CONFIGURACIÓN REAL | certificación y banderas |
| Secuenciales | 100 concurrentes, transacción/lock | TERMINADO LOCALMENTE | último real |
| PostgreSQL | migraciones y `pg-mem` | PARCIAL | instancia real |
| Catálogo fiscal | proveedores y estado de revisión | PARCIAL | aprobación tributaria |
| RIDE | factura/nota, multipágina, pagos y marca | FUNCIONAL CON MOCK | revisión contable/SRI |
| Correo | preview y auditoría | FUNCIONAL CON MOCK | proveedor productivo |
| Versión técnica | discrepancia 2.32/2.33 documentada | REQUIERE CONFIRMACIÓN | verificación directa SRI |

La matriz no certifica validez legal ni autorización.
