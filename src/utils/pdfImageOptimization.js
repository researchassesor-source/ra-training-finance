// Los activos originales se validan contra su SHA-256 antes de llegar aquí.
// El PDF solo necesita la resolución que se ve impresa; conservar un PNG de
// varios megapíxeles puede superar el límite de 4,5 MB del proxy al codificar
// el PDF en base64. Canvas mantiene el canal alfa del logotipo oficial.
export async function fitInstitutionalLogoForPdf(dataUrl) {
  if (!dataUrl || dataUrl.length < 500_000) return dataUrl

  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const scale = Math.min(1, 800 / image.naturalWidth, 450 / image.naturalHeight)
  if (scale === 1) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('No se pudo preparar el logotipo institucional para el PDF.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const fitted = canvas.toDataURL('image/png')
  return fitted.length < dataUrl.length ? fitted : dataUrl
}
