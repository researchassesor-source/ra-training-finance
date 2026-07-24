import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import forge from 'node-forge'
import { afterEach, describe, expect, it } from 'vitest'
import { createEphemeralMaterial, EphemeralTestXadesBesSigner, Pkcs12XadesBesSigner, verifyXadesBes } from '../../src/modules/signing/signer.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))
const xml = '<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ruc>9999999999001</ruc></infoTributaria></factura>'

async function p12File(password: string, validFrom?: Date, validUntil?: Date): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'xades-p12-')); roots.push(root)
  const material = createEphemeralMaterial(validFrom, validUntil)
  const key = forge.pki.privateKeyFromPem(material.privateKeyPem)
  const cert = forge.pki.certificateFromPem(material.certificatePem)
  const asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, { algorithm: '3des' })
  const path = join(root, 'test.p12')
  await writeFile(path, Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'))
  return path
}

describe('firmadores XAdES-BES locales', () => {
  it('firma criptográficamente y detecta alteraciones posteriores', async () => {
    const result = await new EphemeralTestXadesBesSigner().sign(xml)
    expect(result.kind).toBe('EPHEMERAL_TEST_XADES_BES')
    expect(result.xml).toContain('<xades:SignedProperties')
    expect(result.verified).toBe(true)
    expect(verifyXadesBes(result.xml.replace('9999999999001', '9999999999002'))).toBe(false)
  })
  it('firma desde PKCS#12 sin revelar el secreto', async () => {
    const password = 'test-only-password'
    const path = await p12File(password)
    const result = await new Pkcs12XadesBesSigner(path, password).sign(xml)
    expect(result.kind).toBe('PKCS12_XADES_BES')
    expect(result.verified).toBe(true)
    await expect(new Pkcs12XadesBesSigner(path, 'incorrecta').sign(xml)).rejects.not.toThrow(password)
  })
  it('rechaza archivo inexistente, extensión inválida y certificado vencido', async () => {
    await expect(new Pkcs12XadesBesSigner('missing.p12', 'x').sign(xml)).rejects.toThrow('abrir')
    await expect(new Pkcs12XadesBesSigner('missing.pem', 'x').sign(xml)).rejects.toThrow('extensión')
    const expired = await p12File('expired', new Date('2020-01-01'), new Date('2020-01-02'))
    await expect(new Pkcs12XadesBesSigner(expired, 'expired').sign(xml)).rejects.toThrow('vigente')
  })
})
