import { describe, expect, it } from 'vitest'
import type { FiscalDocument } from '../../src/domain/types.js'
import { MockSriGateway, type MockSriScenario } from '../../src/modules/sri/gateway.js'

const document = { accessKey: '2307202601999999999900110010010000000012675389111' } as FiscalDocument

describe('simulador aislado del SRI', () => {
  it.each([
    ['AUTHORIZED', 'RECIBIDA', false],
    ['RETURNED', 'DEVUELTA', false],
    ['PROCESSING', 'EN PROCESO', true],
    ['TEMPORARY_ERROR', 'ERROR TEMPORAL', true],
    ['TIMEOUT', 'TIMEOUT', true],
    ['INVALID_RESPONSE', 'RESPUESTA INVALIDA', false],
    ['DUPLICATE_RESPONSE', 'RECIBIDA', false],
  ] satisfies Array<[MockSriScenario, string, boolean]>)('normaliza recepción para %s', async (scenario, expected, retryable) => {
    const result = await new MockSriGateway(scenario).submitDocument(document, '<xml-mock/>')
    expect(result.status).toBe(expected)
    expect(result.retryable).toBe(retryable)
    expect(result.raw).not.toContain('cel.sri.gob.ec')
  })

  it.each([
    ['AUTHORIZED', 'AUTORIZADO', false],
    ['RETURNED', 'NO AUTORIZADO', false],
    ['NOT_AUTHORIZED', 'NO AUTORIZADO', false],
    ['PROCESSING', 'EN PROCESAMIENTO', true],
    ['TEMPORARY_ERROR', 'ERROR TEMPORAL', true],
    ['TIMEOUT', 'ERROR TEMPORAL', true],
    ['INVALID_RESPONSE', 'RESPUESTA INVALIDA', false],
    ['DUPLICATE_RESPONSE', 'AUTORIZADO', false],
  ] satisfies Array<[MockSriScenario, string, boolean]>)('normaliza autorización para %s', async (scenario, expected, retryable) => {
    const result = await new MockSriGateway(scenario).checkAuthorization(document)
    expect(result.status).toBe(expected)
    expect(result.retryable).toBe(retryable)
  })
})
