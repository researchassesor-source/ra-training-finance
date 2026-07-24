import { describe, expect, it } from 'vitest'
import { importFiscalCatalogCsv, importFiscalCatalogJson } from './fiscalCatalogImport'

const fake = {
  operationalId: 'SVC-FAKE-CSV', mainCode: 'DEMO-01', operationalName: 'Servicio ficticio',
  invoiceDescription: 'Descripción solo para prueba', referencePrice: '12.50', activeForBilling: true,
  status: 'VALIDATED', validatedBy: 'alguien',
}

describe('importación local del catálogo fiscal', () => {
  it('importa JSON y fuerza revisión tributaria', () => {
    const [item] = importFiscalCatalogJson(JSON.stringify([fake]))
    expect(item).toMatchObject({ operationalId: 'SVC-FAKE-CSV', status: 'REQUIRES_TAX_REVIEW', activeForBilling: false })
    expect(item.validatedBy).toBe('')
  })

  it('importa CSV con comas escapadas sin habilitar facturación', () => {
    const csv = 'operational_id,main_code,operational_name,invoice_description,reference_price\nSVC-FAKE-CSV,DEMO-01,Servicio ficticio,"Descripción, solo prueba",12.50'
    const [item] = importFiscalCatalogCsv(csv)
    expect(item.invoiceDescription).toBe('Descripción, solo prueba')
    expect(item.status).toBe('REQUIRES_TAX_REVIEW')
  })

  it('rechaza filas incompletas', () => {
    expect(() => importFiscalCatalogJson('[{"operationalId":"X"}]')).toThrow(/obligatorios/)
  })
})
