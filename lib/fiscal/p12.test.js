import { describe, expect, it } from 'vitest'
import {
  P12FormatError,
  P12PasswordError,
  P12ValidityError,
  parseP12,
  getCertificateMetadata,
  checkCertificateValidity,
  privateKeyToPem,
  certificateToPemAndBase64,
} from './p12.js'
import { buildTestP12Buffer } from './testFixtures.p12.js'

const TEST_PASSWORD = 'contraseña-super-secreta-de-prueba-9x7'

describe('parseP12', () => {
  it('abre un .p12 de prueba válido con la contraseña correcta', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    const { certificate, privateKey } = parseP12(buffer, TEST_PASSWORD)
    expect(certificate).toBeTruthy()
    expect(privateKey).toBeTruthy()
  })

  it('contraseña incorrecta falla de forma segura (P12PasswordError, sin revelar la contraseña)', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    let thrown
    try {
      parseP12(buffer, 'contraseña-totalmente-distinta')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(P12PasswordError)
    expect(thrown.message).not.toContain(TEST_PASSWORD)
    expect(thrown.message).not.toContain('contraseña-totalmente-distinta')
    expect(thrown.stack).not.toContain(TEST_PASSWORD)
  })

  it('P12 corrupto/inválido falla (P12FormatError)', () => {
    const garbage = Buffer.from('esto no es un archivo PKCS12 en absoluto, es texto plano', 'utf8')
    expect(() => parseP12(garbage, TEST_PASSWORD)).toThrow(P12FormatError)
  })

  it('buffer vacío falla', () => {
    expect(() => parseP12(Buffer.alloc(0), TEST_PASSWORD)).toThrow(P12FormatError)
  })

  it('rechaza una contraseña vacía sin siquiera intentar abrir el archivo', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    expect(() => parseP12(buffer, '')).toThrow(P12PasswordError)
  })

  it('un .p12 truncado (DER cortado a la mitad) falla como formato inválido, no cuelga el proceso', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    const truncated = buffer.subarray(0, Math.floor(buffer.length / 2))
    expect(() => parseP12(truncated, TEST_PASSWORD)).toThrow(P12FormatError)
  })
})

describe('getCertificateMetadata', () => {
  it('expone solo metadatos públicos (nunca material de clave privada)', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD, commonName: 'PERSONA DE PRUEBA' })
    const { certificate } = parseP12(buffer, TEST_PASSWORD)
    const metadata = getCertificateMetadata(certificate)
    expect(metadata.subjectCN).toBe('PERSONA DE PRUEBA')
    expect(metadata.keyLengthBits).toBe(2048)
    expect(metadata.sha256Fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(metadata)).not.toMatch(/PRIVATE KEY/)
  })
})

describe('checkCertificateValidity', () => {
  it('acepta un certificado dentro de su ventana de vigencia', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    const { certificate } = parseP12(buffer, TEST_PASSWORD)
    expect(checkCertificateValidity(certificate).valid).toBe(true)
  })

  it('detecta un certificado vencido', () => {
    const { buffer } = buildTestP12Buffer({
      password: TEST_PASSWORD,
      notBefore: new Date('2020-01-01T00:00:00Z'),
      notAfter: new Date('2021-01-01T00:00:00Z'),
    })
    const { certificate } = parseP12(buffer, TEST_PASSWORD)
    expect(() => checkCertificateValidity(certificate, { now: new Date('2026-08-10T00:00:00Z') })).toThrow(P12ValidityError)
  })

  it('detecta un certificado todavía no vigente', () => {
    const { buffer } = buildTestP12Buffer({
      password: TEST_PASSWORD,
      notBefore: new Date('2030-01-01T00:00:00Z'),
      notAfter: new Date('2035-01-01T00:00:00Z'),
    })
    const { certificate } = parseP12(buffer, TEST_PASSWORD)
    expect(() => checkCertificateValidity(certificate, { now: new Date('2026-08-10T00:00:00Z') })).toThrow(P12ValidityError)
  })
})

describe('privateKeyToPem / certificateToPemAndBase64', () => {
  it('produce PEM/base64 utilizables para firmar', () => {
    const { buffer } = buildTestP12Buffer({ password: TEST_PASSWORD })
    const { certificate, privateKey } = parseP12(buffer, TEST_PASSWORD)
    expect(privateKeyToPem(privateKey)).toContain('PRIVATE KEY')
    const { pem, base64 } = certificateToPemAndBase64(certificate)
    expect(pem).toContain('BEGIN CERTIFICATE')
    expect(base64).toMatch(/^[A-Za-z0-9+/=]+$/)
  })
})
