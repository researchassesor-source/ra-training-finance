import { callGasActionAsUser, GasClientError } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'
import { createFiscalDocumentToken } from '../../lib/fiscal/shareToken.js'

function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

function buildUrl(req, facturaId, tipo) {
  const token = createFiscalDocumentToken({ facturaId, tipo })
  return `${requestOrigin(req)}/api/fiscal/public-document?token=${encodeURIComponent(token)}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const body = req.body || {}
  const { facturaId } = body
  const token = getFiscalUserToken(req, body)
  if (!token || !facturaId) {
    res.status(400).json({ success: false, error: 'token y facturaId son obligatorios.' })
    return
  }

  try {
    const detail = await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId }, token, { timeoutMs: 45_000 })
    const factura = detail?.factura || {}
    if (factura.SriAuthorizationStatus !== 'AUTORIZADO' || !factura.AuthorizationNumber) {
      throw new GasClientError('Solo se pueden compartir documentos de una factura autorizada.')
    }
    if (!factura.XmlAuthorizedContent && !factura.XmlAuthorizedReference && !factura.Sha256Authorized) {
      throw new GasClientError('El XML autorizado no está disponible para compartir.')
    }
    if (!factura.RideReference || !factura.Sha256Ride) {
      throw new GasClientError('El RIDE no está disponible para compartir.')
    }

    res.status(200).json({
      success: true,
      data: {
        facturaId,
        expiresIn: '7 días',
        links: {
          ride: buildUrl(req, facturaId, 'RIDE'),
          xml: buildUrl(req, facturaId, 'XML_AUTORIZADO'),
        },
      },
    })
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : 'No se pudieron generar los enlaces de descarga.'
    res.status(502).json({ success: false, error: message })
  }
}
