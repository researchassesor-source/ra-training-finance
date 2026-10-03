import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { sha256Hex } from '../services/certificateArtifactStore'
import { buildCertificatePdf } from './certificateGenerator'
import { CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CERTIFICATE_V2_ISSUER } from './certificateGeneratorV2'

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
const visibleSignature = (() => {
  const image = new PNG({ width: 600, height: 200 })
  const noise = crypto.randomBytes(image.width * image.height * 3)
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    image.data[pixel * 4] = noise[pixel * 3]
    image.data[pixel * 4 + 1] = noise[pixel * 3 + 1]
    image.data[pixel * 4 + 2] = noise[pixel * 3 + 2]
    image.data[pixel * 4 + 3] = 0
  }
  for (let x = 25; x < 575; x += 1) {
    const y = Math.round(104 + 25 * Math.sin(x / 27) + 11 * Math.sin(x / 8))
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const px = x + dx
        const py = y + dy
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue
        const offset = (py * image.width + px) * 4
        image.data[offset] = 8
        image.data[offset + 1] = 40
        image.data[offset + 2] = 82
        image.data[offset + 3] = 255
      }
    }
  }
  return `data:image/png;base64,${PNG.sync.write(image).toString('base64')}`
})()
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

  it('genera la edición v3 con la misma composición y versión documental propia', async () => {
    const previewOptions = {
      ...options,
      signatures: {
        director: process.env.CERTIFICATE_PREVIEW_DIRECTOR_PNG
          ? `data:image/png;base64,${fs.readFileSync(process.env.CERTIFICATE_PREVIEW_DIRECTOR_PNG).toString('base64')}`
          : options.signatures.director,
        manager: process.env.CERTIFICATE_PREVIEW_MANAGER_PNG
          ? `data:image/png;base64,${fs.readFileSync(process.env.CERTIFICATE_PREVIEW_MANAGER_PNG).toString('base64')}`
          : options.signatures.manager,
      },
    }
    const result = await buildCertificatePdf({ ...certificate, TemplateVersion: 'ra-security-2026-v3' }, previewOptions)
    expect(result.templateVersion).toBe('ra-security-2026-v3')
    expect(result.blob.type).toBe('application/pdf')
    expect(result.blob.size).toBeGreaterThan(100_000)
    if (process.env.CERTIFICATE_PREVIEW_V3_FILE) {
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(result.blob)
      })
      fs.writeFileSync(process.env.CERTIFICATE_PREVIEW_V3_FILE, Buffer.from(bytes))
    }
  }, 20_000)

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

  it('genera una reemisión profesional preparada sin fingir que ya fue emitida', async () => {
    const professional = {
      ...certificate, ID: 'PRO-REISSUE-2', CertificatePublicId: 'PRO-REISSUE-2',
      CertificateVersion: 2, TemplateVersion: 'ra-security-2026-v3',
      CertificateSubject: 'professional', ProfessionalRole: 'capacitador',
      CertificateStatus: 'pendiente_pdf', EstadoCertificado: 'pendiente_pdf',
      FechaEmisionCertificado: '', CertificatePreparedAt: '2026-10-02T22:05:39.114Z',
      ReplacesCertificateId: 'PRO-ORIGINAL-1', CodigoCertificado: 'RA-PRO-2026-0002',
      ClienteID: '0604509968', PdfHash: '', PdfStorageReference: '',
    }
    const first = await buildCertificatePdf(professional, options)
    const retried = await buildCertificatePdf(professional, options)
    expect(first.blob.type).toBe('application/pdf')
    expect(await sha256Hex(first.blob)).toBe(await sha256Hex(retried.blob))
    await expect(buildCertificatePdf({ ...professional, ReplacesCertificateId: '' }, options))
      .rejects.toThrow('emitido oficialmente')
    await expect(buildCertificatePdf({ ...professional, CertificatePreparedAt: '' }, options))
      .rejects.toThrow('emitido oficialmente')
  }, 30_000)

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

  it('genera el nuevo certificado avalado desde snapshot institucional, con nombres de firmantes y código separados', async () => {
    const avalado = {
      ...certificate,
      ID: 'AVAL-INSTITUTO-DELTA-1', CertificatePublicId: 'AVAL-INSTITUTO-DELTA-1', CertificateVersion: 1,
      TemplateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CertificateSubject: 'institutional_aval',
      CertificateStatus: 'emitido', CodigoCertificado: 'RA-CERT-2026-DELTA-001', InstitucionAval: 'Instituto Delta',
      EstadoAval: 'avalado', AvalCodigoExterno: 'DELTA-REG-2026-045',
      InstitutionData: {
        institutionId: 'INS-DELTA', agreementId: 'CVN-DELTA', name: 'Instituto Delta', legalName: 'Instituto Delta S.A.',
        siglas: 'DELTA', authorityId: 'AUT-DELTA', authorityName: 'Dra. María Pérez', authorityRole: 'Directora Académica',
        agreementObject: 'Convenio de cooperación 2026', agreementSignedAt: '2026-08-01',
        resolutionName: 'Resolución de creación institucional.pdf', resolutionNotes: 'RPC-SO-22-No.364-2024',
        resolutionDate: '2024-05-29',
      },
    }
    const result = await buildCertificatePdf(avalado, {
      ...options,
      signatures: { manager: visibleSignature },
      signers: { manager: { name: 'Mgs. Alexandra Villagómez', title: 'Gerente General' } },
      institutionAssets: { authoritySignature: visibleSignature },
    })
    expect(result).toMatchObject({ certificateCode: avalado.CodigoCertificado,
      templateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE })
    expect(result.verificationUrl).toContain(avalado.CertificatePublicId)
    expect(result.filename).toContain('DELTA')
    expect(result.blob.type).toBe('application/pdf')
    expect(result.blob.size).toBeGreaterThan(100_000)
    if (process.env.CERTIFICATE_PREVIEW_INSTITUTIONAL_AVAL_FILE) {
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(result.blob)
      })
      fs.writeFileSync(process.env.CERTIFICATE_PREVIEW_INSTITUTIONAL_AVAL_FILE, Buffer.from(bytes))
    }
  }, 30_000)

  it('rechaza el certificado avalado si falta snapshot o la firma de la autoridad externa', async () => {
    const avalado = {
      ...certificate, ID: 'AVAL-INSTITUCION-INCOMPLETA', CertificatePublicId: 'AVAL-INSTITUCION-INCOMPLETA',
      TemplateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CertificateSubject: 'institutional_aval',
      CertificateStatus: 'emitido', CodigoCertificado: 'RA-CERT-2026-DELTA-002', EstadoAval: 'avalado',
      AvalCodigoExterno: 'DELTA-REG-046', InstitutionData: { institutionId: 'INS-DELTA', agreementId: 'CVN-DELTA',
        name: 'Instituto Delta', authorityId: 'AUT-DELTA', authorityName: 'Dra. María Pérez', authorityRole: 'Directora' },
    }
    const signerOptions = { ...options, signers: { manager: { name: 'Mgs. Alexandra Villagómez', title: 'Gerente General' } } }
    await expect(buildCertificatePdf({ ...avalado, InstitutionData: null }, signerOptions)).rejects.toThrow('snapshot completo')
    await expect(buildCertificatePdf(avalado, signerOptions)).rejects.toThrow('Falta la imagen oficial de la autoridad')
  }, 30_000)

  it('no confunde los roles de ponente o capacitador con una inscripción de participante', async () => {
    await expect(buildCertificatePdf({ ...certificate, CertificateType: 'ponente' }, options))
      .rejects.toThrow('tipo de certificado')
  })
})
