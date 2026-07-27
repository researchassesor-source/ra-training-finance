import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../services/api'
import {
  CERTIFICATE_ARTIFACT_ERROR_CODES,
  CertificatePdfRepository,
  MemoryCertificateArtifactStore,
} from '../services/certificateArtifactStore'
import { downloadCertificateWithAudit } from '../services/certificateDownloadFlow'
import { createAppsScriptHarness } from './appsScriptHarness'

const CERTIFICATE_ACTIONS = [
  'getCertificadoParaDescarga',
  'registrarArtefactoCertificado',
  'solicitarDescargaCertificado',
  'confirmarDescargaCertificado',
  'registrarGeneracionCertificado',
  'actualizarEntregaCertificado',
  'enviarCertificadoEmail',
  'getAuditoriaCertificados',
  'anularCertificado',
  'reemitirCertificado',
]

function productionHarness({ templateVersion = 'ra-canva-2026-v1' } = {}) {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [{
    Token: 'production-admin-token', Username: 'admin', UserID: 'USR-ADMIN',
    Rol: 'admin', Nombre: 'Administrador', Expira: '2099-01-01T00:00:00.000Z',
  }])
  harness.seed('Usuarios', [{ ID: 'USR-ADMIN', Nombre: 'Administrador', Username: 'admin', Rol: 'admin', Activo: true }])
  harness.seed('Servicios', [{ ID: 'SRV-PROD', Nombre: 'Curso Producción', Duracion: '40', Activo: true }])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('Certificados', [])
  harness.seed('DescargasCertificados', [])
  harness.seed('Inscripciones', [{
    ID: 'INS-PROD-1', ClienteNombre: 'Participante Producción', ClienteID: '0100000001',
    ClienteEmail: 'participante@example.test', ServicioID: 'SRV-PROD', ServicioNombre: 'Curso Producción',
    Modalidad: 'Virtual', FechaInicio: '2026-07-01', FechaFin: '2026-07-02',
    EstadoPago: 'verificado', EstadoCertificado: 'emitido', CertificateStatus: 'emitido',
    CodigoCertificado: 'RA-2026-PROD1', FechaEmisionCertificado: '2026-07-03T10:00:00.000Z',
    IssuedAt: '2026-07-03T10:00:00.000Z', EmitidoPor: 'admin', IssuedBy: 'admin',
    CertificateVersion: 1, TemplateVersion: templateVersion, CreadoPor: 'admin',
  }])
  return harness
}

function connectFrontendToBackend(harness) {
  const requests = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'))
    requests.push(body)
    const result = harness.context.processRequest(body)
    return { ok: true, json: async () => result }
  })
  localStorage.setItem('rat_token', 'production-admin-token')
  return requests
}

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto, configurable: true })
  }
})

beforeEach(() => {
  localStorage.clear()
})

describe('contrato real de certificados entre frontend y Apps Script productivo', () => {
  it('no deja ninguna acción de api.js fuera de processRequest', () => {
    const root = process.cwd()
    const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8')
    const backendSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')
    const frontendActions = [...apiSource.matchAll(/call(?:Cached|Post)?\('([^']+)'/g)]
      .map(match => match[1])
    const authenticatedHandlers = [...backendSource.matchAll(/^\s*([A-Za-z0-9_]+):\s*\(\)\s*=>/gm)]
      .map(match => match[1])
    const backendActions = new Set(['login', 'verificarCertificado', ...authenticatedHandlers])

    expect([...new Set(frontendActions)].filter(action => !backendActions.has(action))).toEqual([])
  })

  it('mantiene todas las acciones del frontend registradas con el mismo nombre en processRequest', () => {
    const root = process.cwd()
    const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8')
    const backendSource = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')

    CERTIFICATE_ACTIONS.forEach(action => {
      expect(apiSource).toContain(`'${action}'`)
      expect(backendSource).toMatch(new RegExp(`\\n\\s*${action}:\\s*\\(\\)`))
    })
  })

  it('ejecuta certificado nuevo, PDF local, hash, descarga y auditoría usando el contrato productivo', async () => {
    const harness = productionHarness()
    const requests = connectFrontendToBackend(harness)
    const repository = new CertificatePdfRepository({
      store: new MemoryCertificateArtifactStore(),
      buildPdf: async () => ({
        blob: new Blob(['%PDF-produccion'], { type: 'application/pdf' }),
        filename: 'certificado_produccion.pdf',
      }),
    })
    const saveFile = vi.fn()

    await expect(downloadCertificateWithAudit({
      id: 'INS-PROD-1', api, repository, saveFile,
    })).resolves.toMatchObject({ filename: 'certificado_produccion.pdf' })

    expect(requests.map(request => request.action)).toEqual([
      'getCertificadoParaDescarga',
      'registrarArtefactoCertificado',
      'solicitarDescargaCertificado',
      'confirmarDescargaCertificado',
    ])
    expect(saveFile).toHaveBeenCalledOnce()
    expect(harness.objects('DescargasCertificados')[0].Estado).toBe('AUDIT_CONFIRMED')
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toEqual(expect.arrayContaining([
      'CERTIFICATE_ARTIFACT_REGISTERED',
      'CERTIFICATE_DOWNLOAD_REQUESTED',
      'CERTIFICATE_DOWNLOAD_COMPLETED',
    ]))
  })

  it('identifica un certificado histórico sin artefacto y no sustituye silenciosamente su PDF', async () => {
    const harness = productionHarness({ templateVersion: 'legacy-v1' })
    connectFrontendToBackend(harness)
    const response = await api.getCertificadoParaDescarga('INS-PROD-1')
    const repository = new CertificatePdfRepository({
      store: new MemoryCertificateArtifactStore(),
      buildPdf: vi.fn(async () => ({ blob: new Blob(['no debe usarse']) })),
    })

    await expect(repository.prepare(response.data)).rejects.toMatchObject({
      code: CERTIFICATE_ARTIFACT_ERROR_CODES.LEGACY_ARTIFACT_MISSING,
    })
  })

  it('expone la acción exacta cuando el deployment activo usa un backend anterior', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'Acción no reconocida.' }),
    })
    localStorage.setItem('rat_token', 'production-admin-token')

    await expect(api.getCertificadoParaDescarga('INS-PROD-1')).rejects.toMatchObject({
      code: 'BACKEND_ACTION_UNSUPPORTED',
      action: 'getCertificadoParaDescarga',
      message: expect.stringContaining('getCertificadoParaDescarga'),
    })
  })

  it('mantiene el rechazo seguro de una acción verdaderamente desconocida en el backend', () => {
    const harness = productionHarness()
    expect(harness.context.processRequest({
      action: 'accionCertificadoInexistente', token: 'production-admin-token',
    })).toMatchObject({ success: false, error: 'Acción no reconocida.' })
  })
})
