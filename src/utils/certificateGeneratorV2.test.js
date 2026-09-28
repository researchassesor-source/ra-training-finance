import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { sha256Hex } from '../services/certificateArtifactStore'
import { buildCertificatePdf } from './certificateGenerator'
import { CERTIFICATE_V2_ISSUER } from './certificateGeneratorV2'

const root = path.join(process.cwd(), 'src/assets/certificate')
const dataUrl = (file, mimeType) => `data:${mimeType};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`
const transparent = new PNG({ width: 180, height: 60 })
const noise = crypto.randomBytes(180 * 60 * 3)
for (let pixel = 0; pixel < 180 * 60; pixel += 1) {
  transparent.data[pixel * 4] = noise[pixel * 3]
  transparent.data[pixel * 4 + 1] = noise[pixel * 3 + 1]
  transparent.data[pixel * 4 + 2] = noise[pixel * 3 + 2]
  transparent.data[pixel * 4 + 3] = 0
}
const blankSignature = `data:image/png;base64,${PNG.sync.write(transparent).toString('base64')}`
const options = {
  issuerRuc: '0691787373001',
  issuerFile: '401111',
  signatures: { director: blankSignature, manager: blankSignature },
  assetDataUrls: {
    background: dataUrl('certificate-border-v2.png', 'image/png'),
    logo: dataUrl('ra-training-logo.png', 'image/png'),
    mark: dataUrl('ra-training-mark.png', 'image/png'),
    seal: dataUrl('academic-seal.png', 'image/png'),
    itsal: dataUrl('itsal-official-logo.png', 'image/png'),
    regular: dataUrl('canva/IBMPlexSansCondensed-Regular.ttf', 'font/ttf'),
    bold: dataUrl('canva/IBMPlexSansCondensed-Bold.ttf', 'font/ttf'),
    italic: dataUrl('canva/OpenSansCondensed-MediumItalic.ttf', 'font/ttf'),
  },
}
const certificate = {
  ID: 'CERT-PREVIEW', CertificatePublicId: 'CERT-PREVIEW', CertificateVersion: 2,
  TemplateVersion: 'ra-security-2026-v2', CertificateType: 'aprobacion',
  ClienteNombre: 'Participante de Ejemplo', ClienteID: '0100000001', ServicioNombre: 'Curso de Formación Profesional',
  Duracion: '60', FechaInicio: '2026-09-07', FechaFin: '2026-09-09', Modalidad: 'Virtual',
  EstadoPago: 'verificado', EstadoCertificado: 'emitido', CertificateStatus: 'emitido',
  CodigoCertificado: 'RA-CERT-2026-TEST-0001', FechaEmisionCertificado: '2026-09-10T10:00:00.000Z',
}

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto, configurable: true })
})

describe('nueva plantilla de seguridad v2', () => {
  it('conserva el fondo 16:9 proporcionado y requiere firmas y datos oficiales', async () => {
    const png = PNG.sync.read(fs.readFileSync(path.join(root, 'certificate-border-v2.png')))
    expect([png.width, png.height]).toEqual([1600, 900])
    expect(CERTIFICATE_V2_ISSUER).toEqual({ ruc: '0691787373001', expediente: '401111' })
    await expect(buildCertificatePdf(certificate, { ...options, signatures: {} })).rejects.toThrow('firma oficial')
    const onePixel = new PNG({ width: 1, height: 1 })
    await expect(buildCertificatePdf(certificate, { ...options, signatures: { director: `data:image/png;base64,${PNG.sync.write(onePixel).toString('base64')}`, manager: blankSignature } })).rejects.toThrow('no es un recurso oficial')
    await expect(buildCertificatePdf(certificate, { ...options, issuerFile: '' })).rejects.toThrow('expediente')
  })

  it('genera un PDF único verificable y determinista sin alterar la plantilla anterior', async () => {
    const first = await buildCertificatePdf(certificate, options)
    const second = await buildCertificatePdf(certificate, options)
    expect(first.templateVersion).toBe('ra-security-2026-v2')
    expect(first.verificationUrl).toContain('CERT-PREVIEW')
    expect(await sha256Hex(first.blob)).toBe(await sha256Hex(second.blob))
    expect(first.blob.size).toBeGreaterThan(100_000)
    if (process.env.CERTIFICATE_PREVIEW_FILE) {
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(first.blob)
      })
      fs.writeFileSync(process.env.CERTIFICATE_PREVIEW_FILE, Buffer.from(bytes))
    }
  }, 60_000)

  it.each(['asistencia', 'participacion', 'capacitacion'])('admite el tipo %s sin usar el texto de aprobación', async type => {
    const result = await buildCertificatePdf({ ...certificate, CertificateType: type }, options)
    expect(result.blob.type).toBe('application/pdf')
  }, 20_000)

  it('emite un PDF de capacitador independiente del pago de un alumno y con su propia versión', async () => {
    const professional = {
      ...certificate,
      ID: 'PRO-CERT-1', CertificatePublicId: 'PRO-CERT-1', CertificateVersion: 1,
      CertificateSubject: 'professional', ProfessionalRole: 'capacitador',
      ClienteNombre: 'Capacitador de Ejemplo', ClienteID: '0100000002',
      EstadoPago: '', CodigoCertificado: 'RA-PRO-2026-0001',
    }
    const result = await buildCertificatePdf(professional, options)
    expect(result).toMatchObject({ certificateCode: 'RA-PRO-2026-0001', templateVersion: 'ra-security-2026-v2' })
    expect(result.verificationUrl).toContain('PRO-CERT-1')
    expect(result.blob.size).toBeGreaterThan(100_000)
  }, 20_000)

  it('certifica aval ITSAL solo con código institucional y QR propio, sin cambiar el certificado ordinario', async () => {
    const avalado = {
      ...certificate,
      ID: 'AVAL-TEST-1', CertificatePublicId: 'AVAL-TEST-1', CertificateVersion: 1,
      TemplateVersion: 'ra-itsal-security-2026-v1', CertificateSubject: 'institutional_aval',
      CodigoCertificado: 'RA-ITSAL-2026-0001', InstitucionAval: 'ITSAL',
      EstadoAval: 'avalado', AvalCodigoExterno: 'ITSAL-REG-2026-001',
    }
    await expect(buildCertificatePdf({ ...avalado, AvalCodigoExterno: '' }, options)).rejects.toThrow('código de registro ITSAL')
    const result = await buildCertificatePdf(avalado, options)
    expect(result).toMatchObject({ certificateCode: avalado.CodigoCertificado, templateVersion: avalado.TemplateVersion })
    expect(result.verificationUrl).toContain('AVAL-TEST-1')
    expect(result.filename).toContain('ITSAL')
    expect(result.blob.size).toBeGreaterThan(100_000)
    if (process.env.CERTIFICATE_PREVIEW_AVAL_FILE) {
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(result.blob)
      })
      fs.writeFileSync(process.env.CERTIFICATE_PREVIEW_AVAL_FILE, Buffer.from(bytes))
    }
  }, 20_000)

  it('no confunde los roles de ponente o capacitador con una inscripción de participante', async () => {
    await expect(buildCertificatePdf({ ...certificate, CertificateType: 'ponente' }, options))
      .rejects.toThrow('tipo de certificado')
  })
})
