# Nota: discrepancia OpenSSL 3.6.1 vs Windows/node-forge al abrir el .p12 real

## Síntoma reportado por el usuario (10/08/2026)

- `openssl pkcs12 -in <archivo> ...` (incluso con `-legacy`) en OpenSSL 3.6.1 →
  `Mac verify error: invalid password?`
- `Get-PfxCertificate -LiteralPath <archivo>` en PowerShell, con la misma contraseña
  tecleada de forma interactiva → abre correctamente y devuelve el certificado.

Conclusión del usuario, correcta: el archivo es legible y la contraseña es válida. El
problema es de interoperabilidad de OpenSSL con este `.p12` específico, no de la
contraseña ni del archivo. **No se tocó el `.p12` original ni se intentó cambiar su
contraseña.**

## Hipótesis técnica (investigada, no solo memoria)

Se investigó con búsquedas web dirigidas. Dos hallazgos relevantes de la documentación
y foros oficiales de OpenSSL:

1. La codificación de la contraseña en PKCS#12 usa un `BMPString` (UTF-16BE). Según la
   página de manual oficial `passphrase-encoding` de OpenSSL: *"OpenSSL tries to treat
   the received pass phrase as UTF-8 encoded and tries to re-encode it to UTF-16 [...],
   or failing that, assumes ISO8859-1"* — y explícitamente reconoce que *"prior to the
   1.1 release, passwords containing non-ASCII characters were encoded in a
   non-compliant manner, which limited interoperability"*, y que por eso *"even legacy
   encodings are attempted when reading the data"* como compatibilidad hacia atrás.
   ([OpenSSL — passphrase-encoding](https://www.openssl.org/docs/man3.0/man7/passphrase-encoding.html))

2. Es una clase de bug bien documentada en el ecosistema (no exclusiva de este caso):
   herramientas que generan/leen PKCS#12 con distintas convenciones de MAC/algoritmo
   producen exactamente el mensaje `Mac verify error` / `MAC verification failed
   (wrong password?)` en Apple, Windows y OpenSSL entre sí, típicamente por diferencias
   de algoritmo de MAC (SHA-1 vs SHA-256) o de codificación de la contraseña entre
   implementaciones — nunca porque la contraseña en sí esté mal.
   ([discusión OpenSSL PKCS#12 password](https://github.com/openssl/openssl/discussions/22849),
   [PKI.js — PKCS#12 incorrect password error](https://github.com/PeculiarVentures/PKI.js/issues/84))

**Hipótesis más probable para este caso concreto**: el certificado fue emitido por
SECURITY DATA S.A. 2 (entidad certificadora ecuatoriana) y, como es común en el
ecosistema regional, es plausible que el `.p12` se haya generado/exportado con
herramientas basadas en Windows CryptoAPI. Si la contraseña contiene caracteres no-ASCII
(tildes, ñ — muy probable en una contraseña en español), y además se tecleó en una
terminal cuya codificación de consola no coincide con lo que OpenSSL 3.6.1 asume al
leer `stdin`, los bytes que OpenSSL recibe podrían no ser ni siquiera UTF-8/Latin-1
correctos antes de que la lógica de PKCS#12 entre en juego — un problema de codificación
en la cadena terminal → OpenSSL, no del archivo ni de la contraseña "lógica". Windows
CryptoAPI, en cambio, maneja la conversión Unicode de forma nativa y consistente desde
siempre.

No se pudo confirmar esta hipótesis con certeza porque no se tuvo acceso directo a
probar distintas terminales/codepages contra el archivo real (correctamente: no se
manipuló el `.p12` real más allá de lo que pidió el usuario). Queda como hipótesis
documentada, no como hecho verificado.

## Resolución adoptada

Por instrucción del usuario: la prueba que importa es si **node-forge** (la librería
que usa `lib/fiscal/p12.js`, el código que realmente firmará en producción) puede abrir
el archivo — no si la CLI de OpenSSL puede. Se construyó
`scripts/verify-p12-local.mjs` para esa prueba exacta, ejecutada por el usuario
localmente (nunca por este asistente, nunca con la contraseña o el archivo real
pasando por el chat).

- Si node-forge abre el `.p12` real correctamente → **compatibilidad de la aplicación
  confirmada**. La discrepancia de OpenSSL queda registrada como limitación de tooling
  de diagnóstico, no como bloqueo. Fase 5 puede continuar.
- Si node-forge tampoco puede abrirlo → **detenerse**, no avanzar a Fase 5, no
  modificar el `.p12` ni su contraseña sin autorización explícita del usuario, y
  reportar el error exacto (sin la contraseña) para decidir el siguiente paso junto
  con el usuario.
