# Configuración privada del emisor

`fiscal-service/.env.local` es local, está ignorado y no debe copiarse a capturas, issues, commits ni mensajes. Las plantillas contienen solo datos ficticios o `PENDING_CONFIRMATION`.

## Grupos de variables

- Identidad: `FISCAL_ISSUER_RUC`, `FISCAL_ISSUER_BUSINESS_NAME`, `FISCAL_ISSUER_TRADE_NAME`.
- Contacto: ciudad, teléfono y correo.
- Emisión: establecimiento, punto, direcciones, obligación, régimen y secuencial.
- Firma: `FISCAL_CERT_PATH`, `FISCAL_CERT_PASSWORD`, alias y selector de firmador.
- SRI: ambiente y las dos confirmaciones de red, ambas `false` en esta etapa.
- Evidencia: `FISCAL_MASK_PRIVATE_DATA_IN_EVIDENCE=true`.

La contraseña debe migrar a un gestor de secretos y nunca guardarse en base de datos. El archivo PKCS#12 debe permanecer fuera del repositorio, con permisos mínimos, backup cifrado, responsable, rotación y renovación antes del vencimiento. El secuencial se configura solo tras conciliación documentada y doble confirmación.
