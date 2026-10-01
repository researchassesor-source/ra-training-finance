// Preparación local de rúbricas auténticas. Los archivos resultantes son privados:
// nunca se incorporan al repositorio ni se envían a un servicio de imágenes.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
const TARGET = [10, 39, 124]

function decodeJpeg(path) {
  const bytes = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-f', 'image2pipe', '-vcodec', 'png', '-'], {
    maxBuffer: 32 * 1024 * 1024,
  })
  return PNG.sync.read(bytes)
}

function recolorWithoutRedrawing(image, opacityExponent = 1) {
  const output = new PNG({ width: image.width, height: image.height })
  let maxBlueExcess = 0
  for (let i = 0; i < image.data.length; i += 4) {
    maxBlueExcess = Math.max(maxBlueExcess, image.data[i + 2] - image.data[i])
  }
  if (maxBlueExcess < 35) throw new Error('No se detectó tinta azul suficiente; no se modifica la imagen.')
  const threshold = Math.max(5, maxBlueExcess * 0.025)
  let inkPixels = 0
  for (let i = 0; i < image.data.length; i += 4) {
    const blueExcess = image.data[i + 2] - image.data[i]
    const strength = Math.max(0, Math.min(1, (blueExcess - threshold) / (maxBlueExcess - threshold)))
    output.data[i] = TARGET[0]
    output.data[i + 1] = TARGET[1]
    output.data[i + 2] = TARGET[2]
    // La rúbrica de Dirección tiene trazos más finos. Una compensación de
    // opacidad, sin mover ni inventar píxeles, evita que se desvanezca al
    // reducir ambas imágenes al tamaño de impresión del certificado.
    output.data[i + 3] = Math.round(Math.pow(strength, opacityExponent) * image.data[i + 3])
    if (output.data[i + 3]) inkPixels += 1
  }
  if (inkPixels < 1000 || inkPixels > image.width * image.height * 0.4) {
    throw new Error('La proporción de tinta detectada es anómala; no se guarda la imagen.')
  }
  return { output, inkPixels, maxBlueExcess }
}

if (process.argv.length !== 5) {
  throw new Error('Uso: node scripts/prepare-certificate-rubrics.mjs <Alexandra.jpeg> <Edison.jpeg> <directorio-privado>')
}

const [alexandraPath, edisonPath, destination] = process.argv.slice(2).map(path => resolve(path))
const inputs = [
  { source: alexandraPath, filename: 'firma-gerencia-tinta-unificada.png', opacityExponent: 1 },
  { source: edisonPath, filename: 'firma-direccion-tinta-unificada.png', opacityExponent: 0.25 },
]
const prepared = inputs.map(({ source, filename, opacityExponent }) => {
  const image = decodeJpeg(source)
  const result = recolorWithoutRedrawing(image, opacityExponent)
  return { source, filename, ...result, png: PNG.sync.write(result.output) }
})

mkdirSync(destination, { recursive: true })
for (const item of prepared) {
  const path = join(destination, item.filename)
  writeFileSync(path, item.png, { flag: 'wx' })
  const sourceBytes = readFileSync(item.source)
  console.log(`${basename(item.source)} (${sourceBytes.length} bytes) -> ${path}; ${item.output.width}x${item.output.height}; ${item.inkPixels} píxeles de tinta`)
}
