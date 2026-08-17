/**
 * Prueba crítica: simula un entorno SIN xmllint (como el runtime real de Vercel, donde
 * el binario no existe) y demuestra que el flujo completo de firma sigue funcionando de
 * punta a punta. Esto es lo que rompía en producción con la factura 001-002-000000002
 * (HTTP 502 genérico, 18.91s de ejecución, "No se pudo procesar la factura.") — ver el
 * JSDoc de cabecera en xadesSign.js.
 *
 * En vez de espiar módulos individuales (frágil: no cubre bindings nativos), se espía
 * TODO node:child_process — execFileSync, spawnSync, exec, execFile, spawn — durante un
 * signFacturaXml + verifyFacturaXmlSignature reales y se comprueba que ninguno se
 * invoca. Si xml-crypto o cualquier otra dependencia de la ruta de canonicalización
 * empezara a delegar en un binario externo, esta prueba lo detectaría.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const childProcessCalls = vi.hoisted(() => ({ names: [] }))

// vi.spyOn no puede espiar exports de un módulo ESM nativo de Node ("Module namespace
// is not configurable in ESM") — se reemplaza el módulo completo por un mock que
// delega en la implementación real pero registra cada invocación, para poder afirmar
// "cero llamadas" sin perder el comportamiento real de ningún otro código de la
// dependencia (xml-crypto, node-forge, etc.) que sí pudiera necesitarlo.
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal()
  const wrap = (name) => (...args) => { childProcessCalls.names.push(name); return real[name](...args) }
  return {
    ...real,
    execFileSync: wrap('execFileSync'),
    execSync: wrap('execSync'),
    spawnSync: wrap('spawnSync'),
    spawn: wrap('spawn'),
    exec: wrap('exec'),
    execFile: wrap('execFile'),
  }
})

import { buildFacturaXml } from './facturaXml.js'
import { parseP12, privateKeyToPem, certificateToPemAndBase64 } from './p12.js'
import { buildTestP12Buffer } from './testFixtures.p12.js'
import { signFacturaXml, verifyFacturaXmlSignature, canonicalizeC14n } from './xadesSign.js'

const TEST_PASSWORD = 'contraseña-super-secreta-de-prueba-9x7'

function facturaPruebaSri(overrides) {
  return {
    environment: 'test',
    razonSocial: 'RESEARCH ASSESSOR TRAINING S.A.S.',
    nombreComercial: 'RA-TRAINING',
    ruc: '0691787373001',
    claveAcceso: '1'.repeat(48) + '9',
    establishment: '001',
    emissionPoint: '002',
    sequential: '000000001',
    dirMatriz: 'Barrio de los Maestros, calle Bielorusia, Riobamba',
    fechaEmision: new Date(2026, 7, 10),
    obligadoContabilidad: true,
    buyer: { tipoIdentificacion: 'cedula', identificacion: '0804655462', razonSocial: 'Angel David Espinoza Ureta' },
    totalSinImpuestosCents: 100,
    totalDescuentoCents: 0,
    importeTotalCents: 100,
    impuestosTotales: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 }],
    pagos: [{ formaPago: '20', totalCents: 100 }],
    detalles: [{
      descripcion: 'Prueba técnica de capacitación - Ambiente de pruebas',
      cantidad: 1, precioUnitario: 1, precioTotalSinImpuestoCents: 100,
      impuestos: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 }],
    }],
    ...overrides,
  }
}

function testSigningKeys(p12Overrides) {
  const { buffer, password } = buildTestP12Buffer(p12Overrides)
  const { certificate, privateKey } = parseP12(buffer, password)
  const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
  return { privateKeyPem: privateKeyToPem(privateKey), certificatePem, certificateBase64, certificate }
}

describe('signFacturaXml — funciona sin xmllint ni child_process (regresión del HTTP 502 en Vercel)', () => {
  beforeEach(() => {
    childProcessCalls.names.length = 0
  })

  it('firma, verifica y canonicaliza sin invocar execFileSync/spawn/spawnSync/exec/execFile en ningún momento', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const keys = testSigningKeys({ password: TEST_PASSWORD })

    const signedXml = signFacturaXml(unsignedXml, keys)
    expect(signedXml).toContain('<ds:Signature')

    const verification = verifyFacturaXmlSignature(signedXml)
    expect(verification).toEqual({ valid: true })

    // canonicalizeC14n directo también debe quedar cubierto, no solo a través del flujo.
    const canonical = canonicalizeC14n(unsignedXml)
    expect(Buffer.isBuffer(canonical)).toBe(true)
    expect(canonical.length).toBeGreaterThan(0)

    // Estructura XAdES/algoritmos intactos (mismas verificaciones que xadesSign.test.js).
    expect(signedXml).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315')
    expect(signedXml).toContain('http://www.w3.org/2000/09/xmldsig#rsa-sha1')
    expect(signedXml).not.toContain('exc-c14n')
    expect((signedXml.match(/Algorithm="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#sha1"/g) || []).length).toBeGreaterThanOrEqual(3)

    expect(childProcessCalls.names).toEqual([])
  })

  it('rechaza una manipulación posterior a la firma sin recurrir a ningún binario externo', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const keys = testSigningKeys({ password: TEST_PASSWORD })
    const signedXml = signFacturaXml(unsignedXml, keys)
    const tampered = signedXml.replace('<importeTotal>1.00</importeTotal>', '<importeTotal>999.00</importeTotal>')

    const result = verifyFacturaXmlSignature(tampered)
    expect(result.valid).toBe(false)

    expect(childProcessCalls.names).toEqual([])
  })
})
