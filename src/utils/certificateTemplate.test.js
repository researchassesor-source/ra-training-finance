import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

const templatePath = path.join(process.cwd(), 'src/assets/certificate/canva/certificate-template.png')
const png = PNG.sync.read(fs.readFileSync(templatePath))

function rgb(x, y) {
  const index = (png.width * y + x) * 4
  return [png.data[index], png.data[index + 1], png.data[index + 2]]
}

describe('plantilla de certificado aprobada', () => {
  it('conserva el tamaño y orientación originales', () => {
    expect(png.width).toBe(1440)
    expect(png.height).toBe(960)
  })

  it('elimina solo las líneas decorativas observadas', () => {
    expect(rgb(720, 413)).toEqual([254, 253, 248])
    expect(rgb(370, 529)).toEqual([254, 253, 248])
    expect(rgb(1068, 529)).toEqual([254, 253, 248])
  })

  it('conserva los dos espacios de firma y el recuadro QR', () => {
    expect(rgb(400, 787)).toEqual([90, 91, 99])
    expect(rgb(950, 787)).toEqual([90, 91, 99])
    expect(rgb(1220, 680)).toEqual([0, 0, 0])
  })
})
