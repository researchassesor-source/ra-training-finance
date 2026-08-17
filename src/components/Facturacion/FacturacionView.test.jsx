import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FacturacionView from './FacturacionView'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

const state = vi.hoisted(() => ({
  items: [],
  saveAs: vi.fn(),
}))

function renderView() {
  return render(<MemoryRouter><FacturacionView /></MemoryRouter>)
}

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

const authorizedInvoice = {
  id: 'FACT_1786700000000_AUTHZ',
  environment: 'production',
  status: 'DELIVERY_PENDING',
  issueDate: '2026-08-15T10:00:00.000Z',
  documentNumber: '001-002-000000002',
  buyerName: 'Angel David Espinoza Ureta',
  buyerIdentification: '0804655462',
  buyerEmail: '',
  grandTotal: 100,
  taxTotal: 0,
  paymentMethodInternal: '',
  sriPaymentCode: '',
  sriAuthorizationStatus: 'AUTORIZADO',
  authorizationNumber: '1308202601069178737300120010020000000029473817619',
  xmlAvailable: true,
  rideAvailable: false,
  items: [{ id: 'IT-2', codigo: 'CAPACITACION_RA', descripcion: 'Curso de prueba', totalCents: 100, taxRateBasisPoints: 0, sriTaxCode: '2:0' }],
}

describe('FacturacionView', () => {
  beforeEach(() => {
    state.items = []
    state.saveAs.mockClear()
    navigateMock.mockClear()
    Object.values(apiMock).forEach(mock => mock.mockClear())
    window.history.replaceState({}, '', '/facturacion')
  })

  afterEach(() => cleanup())

  it('muestra estado vacío usando el entorno Producción por defecto', async () => {
    renderView()
    expect(await screen.findByText('No hay facturas para estos filtros.')).toBeInTheDocument()
    expect(apiMock.getFacturasFiscales).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' }))
  })

  it('muestra una factura entregada sin inventar forma de pago histórica', async () => {
    state.items = [deliveredInvoice]
    renderView()

    expect(await screen.findByText('001-002-000000001')).toBeInTheDocument()
    expect(screen.getAllByText('Entregada').length).toBeGreaterThan(0)
    expect(screen.getByText('Autorizado')).toBeInTheDocument()
    expect(screen.getByText('No registrado en comprobante histórico')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
  })

  it('permite filtrar por ambiente de pruebas', async () => {
    renderView()
    await screen.findByText('No hay facturas para estos filtros.')
    fireEvent.change(screen.getByDisplayValue('Producción'), { target: { value: 'test' } })
    await waitFor(() => expect(apiMock.getFacturasFiscales).toHaveBeenLastCalledWith(expect.objectContaining({ environment: 'test' })))
  })

  it('descarga XML y RIDE desde acciones seguras', async () => {
    state.items = [deliveredInvoice]
    renderView()
    await screen.findByText('001-002-000000001')

    fireEvent.click(screen.getByTitle('Descargar XML'))
    await waitFor(() => expect(apiMock.descargarDocumentoFiscal).toHaveBeenCalledWith('FACT_1786658883540_SUNGG', 'XML_AUTORIZADO'))
    expect(state.saveAs).toHaveBeenCalled()
  })

  it('14a. sin parámetros, /facturacion funciona exactamente igual que antes', async () => {
    renderView()
    expect(await screen.findByText('No hay facturas para estos filtros.')).toBeInTheDocument()
    expect(apiMock.getFacturasFiscales).toHaveBeenCalledWith(expect.objectContaining({ q: '' }))
  })

  it('14b. ?factura=<ID> abre el detalle de esa factura automáticamente sin romper el buscador', async () => {
    state.items = [deliveredInvoice]
    window.history.replaceState({}, '', `/facturacion?factura=${deliveredInvoice.id}`)
    renderView()

    expect(await screen.findByText(`Factura ${deliveredInvoice.documentNumber}`)).toBeInTheDocument()
    expect(apiMock.getFacturasFiscales).toHaveBeenCalledWith(expect.objectContaining({ q: deliveredInvoice.id }))
  })

  it('14c. ?inscripcion=<ID> abre la factura vinculada a esa inscripción', async () => {
    state.items = [{ ...deliveredInvoice, inscripcionId: 'INS-777' }]
    window.history.replaceState({}, '', '/facturacion?inscripcion=INS-777')
    renderView()

    expect(await screen.findByText(`Factura ${deliveredInvoice.documentNumber}`)).toBeInTheDocument()
  })

  it('solo activa polling cuando existen estados activos', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval')
    state.items = [{ ...deliveredInvoice, id: 'FACT-ACTIVA', status: 'PROCESSING', xmlAvailable: false, rideAvailable: false }]
    renderView()
    await screen.findByText('Procesando en SRI')
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000)
  })

  // Regresión: una factura ya AUTORIZADA por el SRI (DELIVERY_PENDING) quedaba
  // atrapada visualmente -- el botón de avance solo se mostraba con tone === 'process',
  // y AUTHORIZED/DELIVERY_PENDING tienen tone 'success' (fiscalHumanStatus), así que
  // nunca se podía disparar cerrarEntregaFiscal (generar RIDE + cerrar DELIVERED) desde
  // la UI, aunque el backend (finalize-delivery.js) ya lo soportaba sin tocar el SRI.
  describe('acción de avance para facturas ya autorizadas por el SRI (DELIVERY_PENDING/AUTHORIZED)', () => {
    it('1. renderiza "Autorizada · preparando documentos"', async () => {
      state.items = [authorizedInvoice]
      renderView()
      expect(await screen.findByText('Autorizada · preparando documentos')).toBeInTheDocument()
    })

    it('2. existe el botón "Preparar documentos"', async () => {
      state.items = [authorizedInvoice]
      renderView()
      await screen.findByText('001-002-000000002')
      expect(screen.getByTitle('Preparar documentos')).toBeInTheDocument()
    })

    it('3. el click llama a api.cerrarEntregaFiscal(factura.id)', async () => {
      state.items = [authorizedInvoice]
      renderView()
      await screen.findByText('001-002-000000002')

      fireEvent.click(screen.getByTitle('Preparar documentos'))
      await waitFor(() => expect(apiMock.cerrarEntregaFiscal).toHaveBeenCalledWith(authorizedInvoice.id))
    })

    it('4. el click NO llama a api.procesarFacturaFiscal (nunca reprocesa/reenvía al SRI una factura ya autorizada)', async () => {
      state.items = [authorizedInvoice]
      renderView()
      await screen.findByText('001-002-000000002')

      fireEvent.click(screen.getByTitle('Preparar documentos'))
      await waitFor(() => expect(apiMock.cerrarEntregaFiscal).toHaveBeenCalled())
      expect(apiMock.procesarFacturaFiscal).not.toHaveBeenCalled()
    })

    it('5. después del click, recarga el listado', async () => {
      state.items = [authorizedInvoice]
      renderView()
      await screen.findByText('001-002-000000002')
      apiMock.getFacturasFiscales.mockClear()

      fireEvent.click(screen.getByTitle('Preparar documentos'))
      await waitFor(() => expect(apiMock.getFacturasFiscales).toHaveBeenCalled())
    })

    it('6. una factura DELIVERED no muestra ningún botón de avance', async () => {
      state.items = [deliveredInvoice]
      renderView()
      await screen.findByText('001-002-000000001')
      expect(screen.queryByTitle('Preparar documentos')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Actualizar estado')).not.toBeInTheDocument()
    })

    it('cubre también el status AUTHORIZED (compatibilidad) con el mismo comportamiento que DELIVERY_PENDING', async () => {
      state.items = [{ ...authorizedInvoice, id: 'FACT-AUTHORIZED-COMPAT', status: 'AUTHORIZED' }]
      renderView()
      await screen.findByText('001-002-000000002')

      expect(screen.getByTitle('Preparar documentos')).toBeInTheDocument()
      fireEvent.click(screen.getByTitle('Preparar documentos'))
      await waitFor(() => expect(apiMock.cerrarEntregaFiscal).toHaveBeenCalledWith('FACT-AUTHORIZED-COMPAT'))
      expect(apiMock.procesarFacturaFiscal).not.toHaveBeenCalled()
    })

    it('un estado activo previo a la autorización (ej. PROCESSING) sigue mostrando "Actualizar estado" y sigue llamando a procesarFacturaFiscal', async () => {
      state.items = [{ ...authorizedInvoice, id: 'FACT-PROCESSING', status: 'PROCESSING', sriAuthorizationStatus: '', authorizationNumber: '' }]
      renderView()
      await screen.findByText('001-002-000000002')

      const button = screen.getByTitle('Actualizar estado')
      fireEvent.click(button)
      await waitFor(() => expect(apiMock.procesarFacturaFiscal).toHaveBeenCalledWith('FACT-PROCESSING'))
      expect(apiMock.cerrarEntregaFiscal).not.toHaveBeenCalled()
    })
  })

  // Trazabilidad de origen (feat/finance-payment-traceability): navegación de solo
  // lectura hacia la inscripción que originó la factura -- nunca dispara ninguna
  // acción fiscal (crear/procesar factura, SRI, secuenciales).
  describe('trazabilidad hacia la inscripción de origen', () => {
    const invoiceWithOrigin = {
      ...deliveredInvoice,
      inscripcionId: 'INS-777',
      originInscripcion: { id: 'INS-777', servicioNombre: 'Curso Demo', numeroComprobante: 'TRX-998877', fechaPago: '2026-08-01', metodoPago: 'Transferencia' },
    }

    it('"Ver inscripción de origen" (fila) navega a /inscripciones?open=<ID> sin llamar ninguna acción fiscal', async () => {
      state.items = [invoiceWithOrigin]
      renderView()
      await screen.findByText('001-002-000000001')

      fireEvent.click(screen.getByTitle('Ver inscripción de origen'))
      expect(navigateMock).toHaveBeenCalledWith('/inscripciones?open=INS-777')
      expect(apiMock.procesarFacturaFiscal).not.toHaveBeenCalled()
      expect(apiMock.cerrarEntregaFiscal).not.toHaveBeenCalled()
    })

    it('el detalle muestra el comprobante/curso de origen y permite "Ver inscripción" sin modificar nada', async () => {
      state.items = [invoiceWithOrigin]
      renderView()
      await screen.findByText('001-002-000000001')
      fireEvent.click(screen.getByTitle('Ver detalle'))

      expect(await screen.findByText('Curso Demo')).toBeInTheDocument()
      expect(screen.getByText('TRX-998877')).toBeInTheDocument()

      // La fila y el modal muestran cada uno su propio botón "Ver inscripción" --
      // se toma el del modal (el último en el árbol, ver Modal.jsx inline sin portal).
      const buttons = screen.getAllByRole('button', { name: /Ver inscripción/ })
      fireEvent.click(buttons[buttons.length - 1])
      expect(navigateMock).toHaveBeenCalledWith('/inscripciones?open=INS-777')
      expect(apiMock.procesarFacturaFiscal).not.toHaveBeenCalled()
      expect(apiMock.cerrarEntregaFiscal).not.toHaveBeenCalled()
    })

    it('factura legacy sin origen: degrada a "No disponible" sin lanzar error ni mostrar el botón de navegación', async () => {
      state.items = [{ ...deliveredInvoice, inscripcionId: '', originInscripcion: null }]
      renderView()
      await screen.findByText('001-002-000000001')
      expect(screen.queryByTitle('Ver inscripción de origen')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTitle('Ver detalle'))
      expect(await screen.findAllByText('No disponible')).not.toHaveLength(0)
      expect(screen.queryByRole('button', { name: /Ver inscripción/ })).not.toBeInTheDocument()
    })
  })
})
