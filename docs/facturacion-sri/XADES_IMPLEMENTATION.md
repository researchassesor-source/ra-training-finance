# Implementación XAdES-BES

## Firmadores

- `MockXmlSigner`: marcador no criptográfico, solo local y por defecto.
- `EphemeralTestXadesBesSigner`: RSA/certificado autofirmado en memoria, `ds:Signature`, referencias al documento y `SignedProperties`, `SigningTime`, digest del certificado, issuer/serial y verificación posterior.
- `Pkcs12XadesBesSigner`: abre `.p12/.pfx`, valida contraseña/integridad, vigencia y correspondencia llave-certificado, firma y verifica sin registrar secretos.
- `FutureManagedSecretXadesSigner`: contrato sin credenciales.

La verificación detecta modificación posterior. La canonicalización y perfil deben confrontarse con el certificado institucional y el ambiente de certificación; por ello el estado es: **firmador XAdES-BES preparado técnicamente; requiere certificado institucional y validación en certificación**.
