import { describe, expect, it, vi } from 'vitest'
import {
  downloadCertificateWithAudit,
  openCertificatePreviewWindow,
  publicErrorMessage,
} from './certificateDownloadFlow'

function popupFixture() {
  return {
    opener: {},
    closed: false,
    document: document.implementation.createHTMLDocument(''),
    location: { replace: vi.fn() },
    close: vi.fn(),
  }
}

function preparedFixture() {
  return {
    blob: new Blob(['%PDF-fixture'], { type: 'application/pdf' }),
    filename: 'certificado_demo.pdf',
    hash: 'a'.repeat(64),
    reference: 'browser-indexeddb:DEMO:v1',
    templateVersion: 'canva-v1',
    certificateVersion: 1,
  }
}

function flowFixture(overrides = {}) {
  const order = []
  const certificate = { ID: 'DEMO', CertificatePublicId: 'DEMO', CertificateVersion: 1 }
  const prepared = preparedFixture()
  const api = {
    getCertificadoParaDescarga: vi.fn(async () => ({ data: certificate })),
    registrarArtefactoCertificado: vi.fn(async () => ({ success: true })),
    solicitarDescargaCertificado: vi.fn(async () => { order.push('requested'); return { requestId: 'AUD-1' } }),
    confirmarDescargaCertificado: vi.fn(async (_id, result) => { order.push(result); return { success: true } }),
    ...overrides.api,
  }
  const repository = {
    prepare: vi.fn(async () => prepared),
    ...overrides.repository,
  }
  const saveFile = overrides.saveFile || vi.fn(() => order.push('saved'))
  return { api, repository, saveFile, order, certificate, prepared }
}

describe('vista previa y descarga auditada de certificados', () => {
  it('abre la pestaña, descarga, muestra el PDF y confirma la auditoría', async () => {
    const popup = popupFixture()
    const preview = openCertificatePreviewWindow({
      openWindow: () => popup,
      createObjectUrl: () => 'blob:certificado-demo',
      revokeObjectUrl: vi.fn(),
      schedule: vi.fn(),
    })
    const fixture = flowFixture()

    const result = await downloadCertificateWithAudit({
      id: 'DEMO',
      ...fixture,
      preview,
    })

    expect(fixture.saveFile).toHaveBeenCalledWith(fixture.prepared.blob, 'certificado_demo.pdf')
    expect(popup.location.replace).toHaveBeenCalledWith('blob:certificado-demo')
    expect(fixture.order).toEqual(['requested', 'saved', 'completado'])
    expect(result.previewWarning).toBe('')
  })

  it('descarga aun cuando el navegador bloquea el popup y devuelve una advertencia clara', async () => {
    const preview = openCertificatePreviewWindow({ openWindow: () => null })
    const fixture = flowFixture()
    const result = await downloadCertificateWithAudit({ id: 'DEMO', ...fixture, preview })

    expect(fixture.saveFile).toHaveBeenCalledOnce()
    expect(result.previewWarning).toContain('bloqueó la pestaña')
  })

  it('muestra el error de generación en la pestaña y no inicia la descarga', async () => {
    const popup = popupFixture()
    const preview = openCertificatePreviewWindow({ openWindow: () => popup })
    const fixture = flowFixture({
      repository: {
        prepare: vi.fn(async () => { throw new Error('VITE_PUBLIC_APP_URL es obligatoria para emitir certificados en Preview y Production.') }),
      },
    })

    await expect(downloadCertificateWithAudit({ id: 'DEMO', ...fixture, preview })).rejects.toThrow('VITE_PUBLIC_APP_URL')
    expect(fixture.saveFile).not.toHaveBeenCalled()
    expect(popup.document.body.textContent).toContain('VITE_PUBLIC_APP_URL')
  })

  it('detiene la entrega y muestra un error cuando falla la auditoría previa', async () => {
    const popup = popupFixture()
    const preview = openCertificatePreviewWindow({ openWindow: () => popup })
    const fixture = flowFixture({
      api: { solicitarDescargaCertificado: vi.fn(async () => { throw new Error('Auditoría temporalmente no disponible.') }) },
    })

    await expect(downloadCertificateWithAudit({ id: 'DEMO', ...fixture, preview })).rejects.toThrow('Auditoría')
    expect(fixture.saveFile).not.toHaveBeenCalled()
    expect(popup.document.body.textContent).toContain('Auditoría temporalmente no disponible')
  })

  it('mantiene la descarga y marca auditoría pendiente si falla la confirmación final', async () => {
    const popup = popupFixture()
    const preview = openCertificatePreviewWindow({
      openWindow: () => popup,
      createObjectUrl: () => 'blob:certificado-demo',
      schedule: vi.fn(),
    })
    const fixture = flowFixture({
      api: { confirmarDescargaCertificado: vi.fn(async () => { throw new Error('No se confirmó la auditoría.') }) },
    })

    await expect(downloadCertificateWithAudit({ id: 'DEMO', ...fixture, preview }))
      .rejects.toMatchObject({ deliveryStarted: true, auditPending: true, requestId: 'AUD-1' })
    expect(fixture.saveFile).toHaveBeenCalledOnce()
    expect(popup.location.replace).toHaveBeenCalledWith('blob:certificado-demo')
  })

  it('no expone secretos en el mensaje público de error', () => {
    expect(publicErrorMessage(new Error('Authorization Bearer token-secreto')))
      .toBe('No se pudo preparar el certificado. Inténtelo nuevamente o contacte al administrador.')
  })

  it('recupera y descarga inmediatamente un certificado histórico con auditoría marcada', async () => {
    const fixture = flowFixture({
      repository: {
        prepare: vi.fn(async () => ({
          ...preparedFixture(),
          reference: 'browser-indexeddb:DEMO:v1:historical-recovery',
          historicalRecovered: true,
          auditAction: 'CERTIFICATE_HISTORICAL_ARTIFACT_RECOVERED',
        })),
      },
    })

    const result = await downloadCertificateWithAudit({ id: 'DEMO', ...fixture })

    expect(fixture.repository.prepare).toHaveBeenCalledWith(fixture.certificate, { allowHistoricalRecovery: true })
    expect(fixture.api.registrarArtefactoCertificado).toHaveBeenCalledWith('DEMO', expect.objectContaining({
      historicalRecovery: true,
      auditAction: 'CERTIFICATE_HISTORICAL_ARTIFACT_RECOVERED',
    }))
    expect(fixture.saveFile).toHaveBeenCalledOnce()
    expect(result.historicalRecoveryWarning).toContain('plantilla vigente')
  })

  it('reintenta una sola vez la consulta lenta y no duplica ninguna escritura de auditoría', async () => {
    const fixture = flowFixture()
    fixture.api.getCertificadoParaDescarga = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ data: fixture.certificate })
    const preview = { showStage: vi.fn(), showError: vi.fn(), available: false, blocked: false }

    await expect(downloadCertificateWithAudit({
      id: 'DEMO',
      ...fixture,
      preview,
      readRequestTimeoutMs: 5,
    })).resolves.toMatchObject({ certificate: fixture.certificate })

    expect(fixture.api.getCertificadoParaDescarga).toHaveBeenCalledTimes(2)
    expect(preview.showStage).toHaveBeenCalledWith('El servidor está tardando más de lo esperado. Reintentando consulta…')
    expect(fixture.api.registrarArtefactoCertificado).toHaveBeenCalledOnce()
    expect(fixture.api.solicitarDescargaCertificado).toHaveBeenCalledOnce()
    expect(fixture.api.confirmarDescargaCertificado).toHaveBeenCalledOnce()
  })

  it('termina con un error claro después de dos timeouts de lectura', async () => {
    const fixture = flowFixture()
    fixture.api.getCertificadoParaDescarga = vi.fn(() => new Promise(() => {}))
    const preview = { showStage: vi.fn(), showError: vi.fn(), available: false, blocked: false }

    await expect(downloadCertificateWithAudit({
      id: 'DEMO',
      ...fixture,
      preview,
      readRequestTimeoutMs: 5,
    })).rejects.toThrow('después de dos intentos')

    expect(fixture.api.getCertificadoParaDescarga).toHaveBeenCalledTimes(2)
    expect(fixture.api.registrarArtefactoCertificado).not.toHaveBeenCalled()
    expect(fixture.api.solicitarDescargaCertificado).not.toHaveBeenCalled()
    expect(fixture.api.confirmarDescargaCertificado).not.toHaveBeenCalled()
    expect(preview.showError).toHaveBeenCalledOnce()
  })

  it('no reintenta escrituras aunque el registro del artefacto agote su tiempo', async () => {
    const fixture = flowFixture({
      api: { registrarArtefactoCertificado: vi.fn(() => new Promise(() => {})) },
    })

    await expect(downloadCertificateWithAudit({
      id: 'DEMO',
      ...fixture,
      requestTimeoutMs: 5,
    })).rejects.toThrow('registrar el PDF oficial')

    expect(fixture.api.registrarArtefactoCertificado).toHaveBeenCalledOnce()
    expect(fixture.api.solicitarDescargaCertificado).not.toHaveBeenCalled()
    expect(fixture.api.confirmarDescargaCertificado).not.toHaveBeenCalled()
  })

  it('envía al backend la autorización explícita para rebasar una huella legacy', async () => {
    const fixture = flowFixture({
      repository: {
        prepare: vi.fn(async () => ({
          ...preparedFixture(),
          reference: 'browser-indexeddb:DEMO:v1:historical-recovery',
          historicalRecovered: true,
          historicalHashRebaseRequired: true,
          previousPdfHash: 'b'.repeat(64),
          auditAction: 'CERTIFICATE_HISTORICAL_HASH_REBASED',
        })),
      },
    })

    await downloadCertificateWithAudit({ id: 'DEMO', ...fixture })

    expect(fixture.api.registrarArtefactoCertificado).toHaveBeenCalledWith('DEMO', expect.objectContaining({
      historicalHashRebase: true,
      previousPdfHash: 'b'.repeat(64),
      originalArtifactUnavailable: true,
      historicalHashRebaseConfirmation: 'REBASE_HISTORICAL_HASH_ONCE',
      historicalHashRebaseReason: expect.stringContaining('artefacto PDF original'),
    }))
  })
})
