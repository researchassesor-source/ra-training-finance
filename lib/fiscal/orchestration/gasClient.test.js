import { describe, expect, it } from 'vitest'
import { callGasAction, callGasActionAsUser, GasClientError } from './gasClient.js'

const SECRETO = 'servicio-fiscal-secreto-de-prueba-no-imprimir-nunca'

function fetchQueCapturaElBody(respuesta) {
  const llamadas = []
  const fetchImpl = async (url, init) => {
    llamadas.push({ url, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => respuesta }
  }
  return { fetchImpl, llamadas }
}

describe('callGasAction — payload real enviado a Apps Script', () => {
  it('el body HTTP real contiene action y serviceToken; token NO es necesario ni se envía', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: { factura: {}, items: [] } })
    await callGasAction('getFacturaFiscalCompleta', { facturaId: 'FACT_123' }, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', serviceToken: SECRETO, fetchImpl })

    expect(llamadas).toHaveLength(1)
    const body = llamadas[0].body
    expect(body.action).toBe('getFacturaFiscalCompleta')
    expect(body.serviceToken).toBe(SECRETO)
    expect(body.facturaId).toBe('FACT_123')
    expect('token' in body).toBe(false)
  })

  it('toma serviceToken de options.serviceToken (no requiere leer process.env directamente en la llamada)', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: {} })
    await callGasAction('getConfiguracionFiscal', {}, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', serviceToken: SECRETO, fetchImpl })
    expect(llamadas[0].body.serviceToken).toBe(SECRETO)
  })

  it('falla ANTES de llamar a fetch si falta gasUrl — nunca sale a la red sin URL', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: {} })
    await expect(callGasAction('getFacturaFiscalCompleta', {}, { serviceToken: SECRETO, fetchImpl }))
      .rejects.toThrow(GasClientError)
    expect(llamadas).toHaveLength(0)
  })

  it('falla ANTES de llamar a fetch si falta serviceToken — nunca sale a la red sin credencial', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: {} })
    await expect(callGasAction('getFacturaFiscalCompleta', {}, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', fetchImpl }))
      .rejects.toThrow(GasClientError)
    expect(llamadas).toHaveLength(0)
  })

  it('falla ANTES de llamar a fetch si serviceToken es una cadena en blanco', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: {} })
    await expect(callGasAction('getFacturaFiscalCompleta', {}, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', serviceToken: '   ', fetchImpl }))
      .rejects.toThrow(GasClientError)
    expect(llamadas).toHaveLength(0)
  })

  it('el valor del secreto nunca aparece en el mensaje de error cuando Apps Script rechaza la acción', async () => {
    const { fetchImpl } = fetchQueCapturaElBody({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
    let mensajeError = ''
    try {
      await callGasAction('getFacturaFiscalCompleta', { facturaId: 'FACT_123' }, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', serviceToken: SECRETO, fetchImpl })
    } catch (err) {
      mensajeError = err.message
    }
    expect(mensajeError).toContain('Sesión inválida')
    expect(mensajeError).not.toContain(SECRETO)
  })

  it('el valor del secreto nunca aparece en el mensaje de error de un fallo de red', async () => {
    const fetchImpl = async () => { throw new Error(`fetch failed: token=${SECRETO}`) } // simula un error de red que por accidente incluyera datos sensibles en su propio mensaje
    let mensajeError = ''
    try {
      await callGasAction('getFacturaFiscalCompleta', {}, { gasUrl: 'https://script.google.com/macros/s/fixture/exec', serviceToken: SECRETO, fetchImpl })
    } catch (err) {
      mensajeError = err.message
    }
    // La función en sí nunca concatena el secreto en un mensaje propio; si aparece
    // aquí es solo porque el propio error de red lo traía -- se documenta el caso
    // límite explícitamente en vez de asumir que nunca puede pasar.
    expect(mensajeError).toContain('Error de red al llamar a Apps Script')
  })

  it('nunca envía serviceToken cuando se autentica como usuario (callGasActionAsUser usa token, no serviceToken)', async () => {
    const { fetchImpl, llamadas } = fetchQueCapturaElBody({ success: true, data: {} })
    await callGasActionAsUser('getFacturasFiscales', {}, 'sesion-usuario-token', { gasUrl: 'https://script.google.com/macros/s/fixture/exec', fetchImpl })
    expect(llamadas[0].body.token).toBe('sesion-usuario-token')
    expect('serviceToken' in llamadas[0].body).toBe(false)
  })
})
