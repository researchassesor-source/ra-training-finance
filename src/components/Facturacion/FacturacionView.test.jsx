import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FacturacionView from './FacturacionView'

const state = vi.hoisted(() => ({
  items: [],
  saveAs: vi.fn(),
}))

const apiMock = vi.hoisted(() => ({
  getFacturasFiscales: vi.fn(async () => ({
    data: {
      items: state.items,
      summary: {
        total: state.items.length,
        autorizadas: state.items.filter(item => ['AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'].includes(item.status)).length,
        procesando: state.items.filter(item => ['SUBMITTING', 'RECEIVED', 'PROCESSING'].includes(item.status)).length,
        novedad: state.items.filter(item => ['NOT_AUTHORIZED', 'RETURNED'].includes(item.status)).length,
      },
    },
  })),
  descargarDocumentoFiscal: vi.fn(async () => ({ blob: new Blob(['doc']), filename: 'documento.xml' })),
  procesarFacturaFiscal: vi.fn(async () => ({ success: true })),
  cerrarEntregaFiscal: vi.fn(async () => ({ success: true })),
}))

vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('file-saver', () => ({ saveAs: state.saveAs }))

const deliveredInvoice = {
  id: 'FACT_1786658883540_SUNGG',
  environment: 'production',
  status: 'DELIVERED',
  issueDate: '2026-08-13T10:00:00.000Z',
  documentNumber: '001-002-000000001',
  buyerName: 'Andrea Carolina Hinostroza Medina',
  buyerIdentification: '1804417424',
  buyerEmail: '',
  grandTotal: 800,
  taxTotal: 0,
  paymentMethodInternal: '',
  sriPaymentCode: '',
  sriAuthorizationStatus: 'AUTORIZADO',
  authorizationNumber: '1308202601069178737300120010020000000019473817618',
  xmlAvailable: true,
  rideAvailable: true,
  items: [{ id: 'IT-1', codigo: 'CAPACITACION', descripcion: 'Habilidades blandas para profesionales', totalCents: 800, taxRateBasisPoints: 0, sriTaxCode: '2:0' }],
}

describe('FacturacionView', () => {
  beforeEach(() => {
    state.items = []
    state.saveAs.mockClear()
    Object.values(apiMock).forEach(mock => mock.mockClear())
  })

  afterEach(() => cleanup())

  it('muestra estado vacío usando el entorno Producción por defecto', async () => {
    render(<FacturacionView />)
    expect(await screen.findByText('No hay facturas para estos filtros.')).toBeInTheDocument()
    expect(apiMock.getFacturasFiscales).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' }))
  })

  it('muestra una factura entregada sin inventar forma de pago histórica', async () => {
    state.items = [deliveredInvoice]
    render(<FacturacionView />)

    expect(await screen.findByText('001-002-000000001')).toBeInTheDocument()
    expect(screen.getAllByText('Entregada').length).toBeGreaterThan(0)
    expect(screen.getByText('Autorizado')).toBeInTheDocument()
    expect(screen.getByText('No registrado en comprobante histórico')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
  })

  it('permite filtrar por ambiente de pruebas', async () => {
    render(<FacturacionView />)
    await screen.findByText('No hay facturas para estos filtros.')
    fireEvent.change(screen.getByDisplayValue('Producción'), { target: { value: 'test' } })
    await waitFor(() => expect(apiMock.getFacturasFiscales).toHaveBeenLastCalledWith(expect.objectContaining({ environment: 'test' })))
  })

  it('descarga XML y RIDE desde acciones seguras', async () => {
    state.items = [deliveredInvoice]
    render(<FacturacionView />)
    await screen.findByText('001-002-000000001')

    fireEvent.click(screen.getByTitle('Descargar XML'))
    await waitFor(() => expect(apiMock.descargarDocumentoFiscal).toHaveBeenCalledWith('FACT_1786658883540_SUNGG', 'XML_AUTORIZADO'))
    expect(state.saveAs).toHaveBeenCalled()
  })

  it('solo activa polling cuando existen estados activos', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval')
    state.items = [{ ...deliveredInvoice, id: 'FACT-ACTIVA', status: 'PROCESSING', xmlAvailable: false, rideAvailable: false }]
    render(<FacturacionView />)
    await screen.findByText('Procesando en SRI')
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000)
  })
})
