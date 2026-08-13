#
# Prepara el certificado P12 de firma SRI de forma segura, sin nunca imprimir ni
# versionar la contraseña o el contenido del archivo. Ver docs/fiscal/architecture.md
# y docs/fiscal/DATA_MODEL.md — Fase 4.
#
# Qué hace:
#   1. Pide la ruta del .p12 y la contraseña (oculta, SecureString).
#   2. Valida con OpenSSL que la contraseña abre el archivo, sin mostrarla nunca.
#   3. Muestra únicamente metadatos públicos del certificado (titular, vigencia, serie)
#      para que el operador confirme visualmente que es el certificado correcto.
#   4. Codifica el .p12 en base64 y lo guarda SOLO en una carpeta privada fuera del
#      repositorio: %USERPROFILE%\.ra-training-secrets\sri\
#   5. Aplica permisos restrictivos (solo el usuario actual) a esa carpeta.
#   6. Imprime el nombre de las variables a cargar en el proveedor de hosting — nunca
#      su valor — y recuerda borrar la copia temporal cuando ya no se necesite.
#
# Qué NO hace (a propósito): no sube nada a Vercel ni a ningún proveedor, no modifica
# variables de Producción, no importa el certificado al almacén de Windows.
#
# Uso:
#   powershell -File scripts\configure-sri-certificate.ps1
#

param(
  [string]$P12Path,
  [string]$SecretsDir = (Join-Path $env:USERPROFILE '.ra-training-secrets\sri')
)

$ErrorActionPreference = 'Stop'

function Read-PlainFromSecure([System.Security.SecureString]$secure) {
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not $P12Path) {
  $P12Path = Read-Host 'Ruta completa del archivo .p12'
}
if (-not (Test-Path -LiteralPath $P12Path -PathType Leaf)) {
  throw "No se encontró el archivo: $P12Path"
}

$securePassword = Read-Host -AsSecureString 'Contraseña del .p12 (no se mostrará en pantalla)'
$plainPassword = Read-PlainFromSecure $securePassword

try {
  # La contraseña viaja solo por una variable de entorno del proceso hijo de OpenSSL,
  # nunca como argumento de línea de comandos (evita que aparezca en la lista de
  # procesos) y nunca se imprime.
  $env:__P12_PW_TMP = $plainPassword

  Write-Host 'Validando contraseña y estructura del .p12 con OpenSSL...'
  & openssl pkcs12 -in "$P12Path" -noout -passin env:__P12_PW_TMP 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'La contraseña es incorrecta o el archivo .p12 está corrupto/no es un PKCS#12 válido.'
  }
  Write-Host 'Contraseña correcta, archivo válido.' -ForegroundColor Green

  Write-Host ''
  Write-Host 'Metadatos públicos del certificado (confirme que es el correcto):'
  $certPem = & openssl pkcs12 -in "$P12Path" -clcerts -nokeys -passin env:__P12_PW_TMP 2>$null
  $certPem | & openssl x509 -noout -subject -issuer -dates -serial

  New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

  $base64Path = Join-Path $SecretsDir 'sri_cert_p12_base64.txt'
  $bytes = [System.IO.File]::ReadAllBytes($P12Path)
  [System.Convert]::ToBase64String($bytes) | Set-Content -NoNewline -Path $base64Path -Encoding ascii

  # Restringe la carpeta al usuario actual únicamente.
  icacls $SecretsDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null

  Write-Host ''
  Write-Host "Base64 del .p12 guardado en: $base64Path" -ForegroundColor Yellow
  Write-Host 'Ese archivo NO está dentro del repositorio y está bloqueado por .gitignore si alguna vez se copiara ahí por error.'
  Write-Host ''
  Write-Host 'Próximos pasos manuales (fuera de este script, este script no toca ningún proveedor):'
  Write-Host '  1. Cargar el contenido de ese archivo como la variable SRI_CERT_P12_BASE64'
  Write-Host '     en el gestor de secretos de Vercel (Preview primero, nunca Production todavía).'
  Write-Host '  2. Cargar la contraseña como la variable SRI_CERT_PASSWORD, tecleándola'
  Write-Host '     directamente en el formulario de Vercel — no la pegue en ningún chat ni la'
  Write-Host '     guarde en un archivo de texto.'
  Write-Host "  3. Cuando confirme que ambas variables quedaron cargadas, borre $base64Path"
  Write-Host '     manualmente (Remove-Item) — este script no lo borra automáticamente para'
  Write-Host '     que usted pueda verificar la carga antes de perder la única copia local.'
} finally {
  Remove-Item Env:\__P12_PW_TMP -ErrorAction SilentlyContinue
  $plainPassword = $null
  [System.GC]::Collect()
}
