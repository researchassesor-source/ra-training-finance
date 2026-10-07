import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CertificadosAvalView from './CertificadosAvalView'

const mock = vi.hoisted(() => ({
  admin: true,
  getCertificadosAval: vi.fn(),
  buscarCertificadosParaAvalPosterior: vi.fn(),
  getIngresos: vi.fn(),
  getOpcionesInstitucionesMaestras: vi.fn(),
  getConveniosParaAval: vi.fn(),
  configurarAvalPosteriorCertificado: vi.fn(),
  corregirIdentificacionAvalConfirmado: vi.fn(),
  corregirNombreAvalConfirmado: vi.fn(),
  getHistorialCertificados: vi.fn(),
}))

vi.mock('../../services/api', () => ({ api: {
  getCertificadosAval: mock.getCertificadosAval,
  buscarCertificadosParaAvalPosterior: mock.buscarCertificadosParaAvalPosterior,
  getIngresos: mock.getIngresos,
  getOpcionesInstitucionesMaestras: mock.getOpcionesInstitucionesMaestras,
  getConveniosParaAval: mock.getConveniosParaAval,
  configurarAvalPosteriorCertificado: mock.configurarAvalPosteriorCertificado,
  corregirIdentificacionAvalConfirmado: mock.corregirIdentificacionAvalConfirmado,
  corregirNombreAvalConfirmado: mock.corregirNombreAvalConfirmado,
  getHistorialCertificados: mock.getHistorialCertificados,
} }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: mock.admin }) }))

const row = {
  ID: 'INS-ITSAL-1', ClienteNombre: 'Persona de Prueba', ClienteID: '0100000001',
  ClienteEmail: 'persona@example.com', ServicioNombre: 'Curso de Prueba',
  InstitucionAval: 'ITSAL', EstadoAval: 'avalado', AvalCodigoExterno: 'ITSAL-1',
  FechaInicio: '2026-09-01', FechaFin: '2026-09-02', Duracion: '40 horas',
  EntregableAval: { ID: 'AVAL-1', CodigoCertificado: 'RA-ITSAL-001',
    CertificateStatus: 'emitido', TemplateVersion: 'ra-itsal-security-2026-v1',
    PdfHash: 'a'.repeat(64), EstadoEntregaFinal: 'pendiente_envio' },
}

afterEach(() => { cleanup(); vi.clearAllMocks(); mock.admin = true })

const normalCertificate = {
  ID: 'CERT-NORMAL-1', CodigoCertificado: 'RA-NORMAL-001', CertificateStatus: 'emitido',
  CertificateVersion: 1, VersionHistory: [{ id: 'CERT-NORMAL-1', version: 1, pdfArchived: true }],
}

describe('entregable institucional ITSAL', () => {
  it('no ofrece una primera emisión avalada mientras el curso sigue programado', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{ ...row,
      FechaInicio: '2099-12-01', FechaFin: '2099-12-31', EntregableAval: null,
    }] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/espere hasta que termine el curso/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Emitir y descargar avalado' })).toBeDisabled()
  })

  it('permite al admin descargar el PDF archivado y decidir explícitamente su envío', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [row] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/PDF oficial archivado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar avalado' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar por correo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crear nueva versión' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corregir identificación' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corregir nombre' })).toBeTruthy()
  })

  it('muestra la emisión para instituciones distintas de ITSAL y no ofrece versionado fuera de alcance', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      ID: 'INS-DELTA-1',
      InstitucionAval: 'Instituto Delta',
      AvalCodigoExterno: 'DELTA-2026-001',
      EntregableAval: { ID: 'AVAL-DELTA-1', CodigoCertificado: 'RA-DELTA-001',
        CertificateStatus: 'pendiente_pdf', TemplateVersion: 'ra-institutional-aval-2026',
        EstadoEntregaFinal: 'pendiente_envio' },
    }] })
    render(<CertificadosAvalView />)
    expect(await screen.findAllByText('Instituto Delta')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Emitir y descargar avalado' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).toBeNull()
  })

  it('exige motivo y confirmación para corregir cédula y oculta el envío del PDF anterior', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row, ClienteTipoIdentificacion: 'CEDULA_EC',
      EntregableAval: { ...row.EntregableAval, RequiereReemisionIdentificacion: true },
    }] })
    mock.corregirIdentificacionAvalConfirmado.mockResolvedValue({ success: true })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/La identificación actual difiere/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enviar por correo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Corregir identificación' }))
    expect(screen.getByText(/La versión archivada y las facturas emitidas permanecen intactas/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Identificación corregida'), { target: { value: '0601234560' } })
    fireEvent.change(screen.getByLabelText('Motivo y respaldo de la corrección'), { target: { value: 'Cédula cotejada con documento original' } })
    const save = screen.getByRole('button', { name: 'Guardar corrección' })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(save)
    expect(mock.corregirIdentificacionAvalConfirmado).toHaveBeenCalledWith('INS-ITSAL-1', {
      identificacionAnterior: '0100000001', identificacionNueva: '0601234560',
      tipoIdentificacion: 'CEDULA_EC', motivo: 'Cédula cotejada con documento original',
    })
  })

  it('corrige el nombre con tilde bajo auditoría y bloquea enviar el PDF con el nombre anterior', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      ClienteNombre: 'Jonathan Eduardo Lopez Poveda',
      EntregableAval: { ...row.EntregableAval, RequiereReemisionNombre: true },
    }] })
    mock.corregirNombreAvalConfirmado.mockResolvedValue({ success: true })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/El nombre actual difiere del PDF archivado/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enviar por correo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Corregir nombre' }))
    fireEvent.change(screen.getByLabelText('Nombre completo corregido'), {
      target: { value: 'Jonathan Eduardo López Poveda' },
    })
    fireEvent.change(screen.getByLabelText('Motivo y respaldo de la corrección'), {
      target: { value: 'Apellido verificado con tilde en documento original' },
    })
    const save = screen.getByRole('button', { name: 'Guardar corrección' })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(save)
    expect(mock.corregirNombreAvalConfirmado).toHaveBeenCalledWith('INS-ITSAL-1', {
      nombreAnterior: 'Jonathan Eduardo Lopez Poveda',
      nombreNuevo: 'Jonathan Eduardo López Poveda',
      motivo: 'Apellido verificado con tilde en documento original',
    })
  })

  it('muestra el historial sin mezclar los PDF de cada versión', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      EntregableAval: { ...row.EntregableAval, VersionHistory: [
        { id: 'AVAL-OLD', version: 1, codigo: 'RA-ITSAL-OLD', estado: 'reemitido', templateVersion: 'aval-v1', issuedAt: '2026-09-01T12:00:00.000Z', issuedBy: 'admin.demo', reason: 'Corrección del código externo', pdfArchived: true },
        { id: 'AVAL-PENDING', version: 2, codigo: 'RA-ITSAL-PENDING', estado: 'pendiente_pdf', templateVersion: 'aval-v1', issuedAt: '2026-09-02T12:00:00.000Z', issuedBy: 'admin.demo', reason: 'Reemisión pendiente', pdfArchived: false },
      ] },
    }] })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Historial aval (2)' }))
    expect(await screen.findByRole('heading', { name: 'Historial de versiones del aval' })).toBeTruthy()
    expect(screen.getByText('RA-ITSAL-OLD')).toBeTruthy()
    expect(screen.getByText('Corrección del código externo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar PDF original' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'PDF no archivado' })).toBeDisabled()
    expect(screen.getByRole('status').textContent).toContain('vigencia')
  })

  it('no expone emisión ni envío al rol institucional', async () => {
    mock.admin = false
    mock.getCertificadosAval.mockResolvedValue({ data: [{ ...row, EntregableAval: null }] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText('Persona de Prueba')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Descargar avalado' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar por correo' })).toBeNull()
  })

  it('configura el aval posterior solo tras confirmación explícita y presenta el certificado normal como intacto', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      EstadoAval: 'pendiente',
      AvalCodigoExterno: '',
      CertificadoNormal: normalCertificate,
      AvalUpgradeVerificado: true,
      AvalUpgradeCRMOrderID: 'CRM-UPGRADE-1',
      PuedeConfigurarAvalPosterior: true,
      EntregableAval: null,
    }] })
    mock.getOpcionesInstitucionesMaestras.mockResolvedValue({ data: [{ ID: 'INST-1', Nombre: 'Instituto de Prueba', Siglas: 'IP' }] })
    mock.getConveniosParaAval.mockResolvedValue({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', PorcentajeAval: 15, DisponibleParaAval: true }] })
    mock.configurarAvalPosteriorCertificado.mockResolvedValue({ data: { institutionName: 'Instituto de Prueba' } })
    render(<CertificadosAvalView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar aval posterior' }))
    expect(await screen.findByText(/El certificado normal se conservará sin cambios/)).toBeTruthy()
    expect(screen.getByText(/Certificado normal: RA-NORMAL-001/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Institución avaladora'), { target: { value: 'INST-1' } })
    expect(await screen.findByRole('option', { name: /Convenio vigente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Convenio vigente y regla económica'), { target: { value: 'CONV-1' } })
    const submit = screen.getByRole('button', { name: 'Continuar con el aval' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    expect(mock.configurarAvalPosteriorCertificado).toHaveBeenCalledWith('INS-ITSAL-1', {
      institucionId: 'INST-1', convenioId: 'CONV-1',
    })
    expect(await screen.findByText(/El certificado normal permanece intacto/)).toBeTruthy()
  })

  it('busca un certificado Finance emitido y exige autorización comercial antes de agregar el aval', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [] })
    mock.buscarCertificadosParaAvalPosterior.mockResolvedValue({ data: [{
      ID: 'INS-MANUAL-1', ClienteNombre: 'Ana Pérez', ClienteID: 'P12345678',
      ServicioNombre: 'Curso de Prueba', CertificadoNormal: normalCertificate,
      OrigenCRM: false, PuedeConfigurarAvalPosterior: true,
    }] })
    mock.getOpcionesInstitucionesMaestras.mockResolvedValue({ data: [{ ID: 'INST-1', Nombre: 'Instituto de Prueba' }] })
    mock.getConveniosParaAval.mockResolvedValue({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', DisponibleParaAval: true }] })
    mock.getIngresos.mockResolvedValue({ data: [] })
    mock.configurarAvalPosteriorCertificado.mockResolvedValue({ data: { institutionName: 'Instituto de Prueba' } })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir aval a certificado ya emitido' }))
    fireEvent.change(screen.getByLabelText('Buscar certificado emitido'), { target: { value: 'RA-NORMAL-001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText(/Ana Pérez · Curso de Prueba/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Preparar aval posterior' }))
    expect(await screen.findByText('Autorización comercial del aval posterior')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Institución avaladora'), { target: { value: 'INST-1' } })
    expect(await screen.findByRole('option', { name: /Convenio vigente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Convenio vigente y regla económica'), { target: { value: 'CONV-1' } })
    const submit = screen.getByRole('button', { name: 'Continuar con el aval' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Autorizado sin cobro adicional'))
    fireEvent.change(screen.getByLabelText(/Motivo y autorización/), { target: { value: 'Aval posterior autorizado expresamente por gerencia.' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(mock.configurarAvalPosteriorCertificado).toHaveBeenCalledWith('INS-MANUAL-1', {
      institucionId: 'INST-1', convenioId: 'CONV-1',
      motivo: 'Aval posterior autorizado expresamente por gerencia.',
      ingresoAvalId: '', sinCobroAutorizado: true,
    })
  })

  it('permite registrar el cobro desde la ventana y enviarlo junto con el aval posterior', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [] })
    mock.buscarCertificadosParaAvalPosterior.mockResolvedValue({ data: [{
      ID: 'INS-MANUAL-1', ClienteNombre: 'Ana Pérez', ServicioNombre: 'Curso de Prueba',
      CertificadoNormal: normalCertificate, OrigenCRM: false, PuedeConfigurarAvalPosterior: true,
    }] })
    mock.getOpcionesInstitucionesMaestras.mockResolvedValue({ data: [{ ID: 'INST-1', Nombre: 'Instituto de Prueba' }] })
    mock.getConveniosParaAval.mockResolvedValue({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', DisponibleParaAval: true }] })
    mock.getIngresos.mockResolvedValue({ data: [] })
    mock.configurarAvalPosteriorCertificado.mockResolvedValue({ data: { institutionName: 'Instituto de Prueba', incomeId: 'ING-1' } })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir aval a certificado ya emitido' }))
    fireEvent.change(screen.getByLabelText('Buscar certificado emitido'), { target: { value: 'RA-NORMAL-001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar aval posterior' }))
    expect(await screen.findByRole('option', { name: 'Instituto de Prueba' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Institución avaladora'), { target: { value: 'INST-1' } })
    expect(await screen.findByRole('option', { name: /Convenio vigente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Convenio vigente y regla económica'), { target: { value: 'CONV-1' } })
    fireEvent.click(screen.getByLabelText('Aval con cobro adicional'))
    const submit = screen.getByRole('button', { name: 'Registrar cobro y continuar' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Fecha del cobro'), { target: { value: '2026-10-06' } })
    fireEvent.change(screen.getByLabelText('Monto cobrado (USD)'), { target: { value: '8.50' } })
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'Transferencia' } })
    fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'BANCO-AVAL-100' } })
    fireEvent.change(screen.getByLabelText(/Motivo y autorización/), { target: { value: 'Cobro adicional confirmado y aval solicitado por administración.' } })
    fireEvent.click(screen.getByLabelText(/Confirmo que este monto ya fue recibido/))
    fireEvent.click(screen.getByLabelText(/Confirmo que la selección corresponde al aval solicitado/))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(mock.configurarAvalPosteriorCertificado).toHaveBeenCalledWith('INS-MANUAL-1', {
      institucionId: 'INST-1', convenioId: 'CONV-1',
      motivo: 'Cobro adicional confirmado y aval solicitado por administración.',
      ingresoAvalId: '', sinCobroAutorizado: false,
      nuevoIngresoAval: { fecha: '2026-10-06', monto: 8.5, metodoPago: 'Transferencia',
        referencia: 'BANCO-AVAL-100', cobroConfirmado: true },
    })
    expect(await screen.findByText(/Cobro de .* registrado en Ingresos/)).toBeTruthy()
  })

  it('ofrece el cobro en la misma ventana para Alexander, inscripción CRM anterior al módulo de compras', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [] })
    mock.buscarCertificadosParaAvalPosterior.mockResolvedValue({ data: [{
      ID: 'INS-CRM-LEGACY-ALEXANDER', ClienteNombre: 'Alexander Mosquera Puente',
      ServicioNombre: 'IA para Apoyo en Tareas Académicas', CertificadoNormal: normalCertificate,
      OrigenCRM: true, CobroEnFinance: true, PuedeConfigurarAvalPosterior: true, MotivoBloqueo: '',
    }] })
    mock.getOpcionesInstitucionesMaestras.mockResolvedValue({ data: [{ ID: 'INST-1', Nombre: 'Instituto de Prueba' }] })
    mock.getConveniosParaAval.mockResolvedValue({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', DisponibleParaAval: true }] })
    mock.getIngresos.mockResolvedValue({ data: [] })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir aval a certificado ya emitido' }))
    fireEvent.change(screen.getByLabelText('Buscar certificado emitido'), { target: { value: '1752233005' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText(/Inscripción CRM anterior al módulo de compras/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Preparar aval posterior' }))
    expect(await screen.findByRole('option', { name: 'Instituto de Prueba' })).toBeTruthy()
    expect(mock.getIngresos).toHaveBeenCalled()
    expect(screen.getByLabelText('Aval con cobro adicional')).toBeTruthy()
    expect(screen.getByLabelText('Autorizado sin cobro adicional')).toBeTruthy()
    expect(screen.getByLabelText(/Motivo y autorización/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continuar con el aval' })).toBeDisabled()
  })

  it('muestra el historial normal aislado y descarga la versión archivada desde su propio vínculo', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      CertificadoNormal: normalCertificate,
      EntregableAval: null,
    }] })
    mock.getHistorialCertificados.mockResolvedValue({ data: [{ id: 'CERT-NORMAL-1', codigo: 'RA-NORMAL-001', version: 1,
      estado: 'emitido', plantilla: 'normal-v1', fecha: '2026-09-01', actor: 'admin', motivo: '', pdfArchivado: true }] })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: /Historial \(1\)/ }))
    expect(await screen.findByRole('heading', { name: 'Historial del certificado normal' })).toBeTruthy()
    expect(screen.getByText('Este historial corresponde solo al certificado normal. Las versiones y archivos del certificado avalado se administran por separado.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar PDF original' })).toBeTruthy()
  })
})
