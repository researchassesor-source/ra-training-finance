import { createHash } from 'node:crypto'

export interface XmlSignerResult {
  xml: string
  kind: 'MOCK_NON_CRYPTOGRAPHIC'
  digest: string
  warning: string
}

export interface XmlSigner {
  sign(xml: string): Promise<XmlSignerResult>
}

export class MockXmlSigner implements XmlSigner {
  async sign(xml: string): Promise<XmlSignerResult> {
    const digest = createHash('sha256').update(xml).digest('hex')
    const closeTag = xml.includes('</factura>') ? '</factura>' : '</notaCredito>'
    const marker = `<!-- FIRMA MOCK NO CRIPTOGRAFICA | SIN VALIDEZ TRIBUTARIA | SHA256 ${digest} -->`
    return {
      xml: xml.replace(closeTag, `${marker}${closeTag}`),
      kind: 'MOCK_NON_CRYPTOGRAPHIC',
      digest,
      warning: 'No es XAdES_BES, no usa certificado y no tiene validez tributaria.',
    }
  }
}

export interface SriCompatibleSigner extends XmlSigner {
  readonly requiresXadesBes132: true
  readonly requiresSecretReference: true
}
