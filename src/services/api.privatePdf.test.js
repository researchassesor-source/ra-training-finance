import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function requestBody(call) {
  return JSON.parse(call[1].body)
}

describe('transporte privado de PDFs', () => {
  beforeEach(() => {
    localStorage.setItem('rat_token', 'admin-token')
    global.fetch = vi.fn()
  })

  it('recupera un HTTP 413 de archivo por fragmentos sin reemplazar el código del certificado', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Payload too large' }, 413))
      .mockResolvedValueOnce(jsonResponse({ success: true, chunkIndex: 0 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, hash: 'a'.repeat(64), reference: 'certificate-drive:drive-1' }))

    const result = await api.guardarPdfEntregableAvalPrivado('INS-1', {
      pdfBase64: 'YWJj', pdfHash: 'a'.repeat(64), templateVersion: 'ra-institutional-aval-2026',
    })

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(requestBody(fetch.mock.calls[0]).action).toBe('guardarPdfEntregableAvalPrivado')
    expect(requestBody(fetch.mock.calls[1])).toMatchObject({ action: 'guardarPdfPrivadoChunk', kind: 'aval', id: 'INS-1', chunkIndex: 0 })
    expect(requestBody(fetch.mock.calls[2])).toMatchObject({ action: 'finalizarPdfPrivadoChunk', kind: 'aval', id: 'INS-1', pdfHash: 'a'.repeat(64) })
  })

  it('recupera una descarga grande tras HTTP 413 y recompone el contenido de una misma versión', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Payload too large' }, 413))
      .mockResolvedValueOnce(jsonResponse({ success: true, reference: 'certificate-drive:drive-1', hash: 'b'.repeat(64),
        filename: 'aval.pdf', totalBytes: 3, chunkBytes: 1572864, totalChunks: 1, chunkIndex: 0, contentBase64: 'YWJj' }))

    const result = await api.leerPdfEntregableAvalPrivado('INS-1', 'AVAL-V1')

    expect(result).toMatchObject({ reference: 'certificate-drive:drive-1', hash: 'b'.repeat(64), filename: 'aval.pdf', contentBase64: 'YWJj' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(requestBody(fetch.mock.calls[1])).toMatchObject({ action: 'leerPdfPrivadoChunk', kind: 'aval', id: 'INS-1', versionId: 'AVAL-V1', chunkIndex: 0 })
  })

  it('envía proactivamente los PDFs sobre el límite seguro en fragmentos debajo del límite de Vercel', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, chunkIndex: 0 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, chunkIndex: 1 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, hash: 'c'.repeat(64), reference: 'certificate-drive:drive-2' }))

    const result = await api.guardarPdfCertificadoPrivado('CERT-1', {
      pdfBase64: 'A'.repeat(3000004), pdfHash: 'c'.repeat(64), templateVersion: 'ra-security-2026-v2', certificateVersion: 1,
    })

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    const first = requestBody(fetch.mock.calls[0])
    const last = requestBody(fetch.mock.calls[1])
    expect(first.chunkBase64).toHaveLength(2097152)
    expect(last.chunkBase64).toHaveLength(902852)
    expect(JSON.parse(fetch.mock.calls[0][1].body).action).toBe('guardarPdfPrivadoChunk')
    expect(requestBody(fetch.mock.calls[2])).toMatchObject({ action: 'finalizarPdfPrivadoChunk', kind: 'certificate', certificateVersion: 1 })
  })

  it('migra PDFs originales grandes por fragmentos ligados a la inscripción y versión exactas', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, chunkIndex: 0 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, chunkIndex: 1 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, hash: 'e'.repeat(64), reference: 'certificate-drive:drive-migrated' }))

    const result = await api.migrarPdfCertificadoPrivado('INS-1', {
      certificateId: 'CERT-4', pdfBase64: 'A'.repeat(3000004), pdfHash: 'e'.repeat(64),
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 4,
      motivo: 'Archivar el PDF oficial original.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    })

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(requestBody(fetch.mock.calls[0])).toMatchObject({ action: 'guardarPdfPrivadoChunk', kind: 'certificate-migration', id: 'INS-1', versionId: 'CERT-4' })
    expect(requestBody(fetch.mock.calls[2])).toMatchObject({ action: 'finalizarPdfPrivadoChunk', kind: 'certificate-migration', id: 'INS-1',
      versionId: 'CERT-4', certificateId: 'CERT-4', certificateVersion: 4,
      confirmacion: 'MIGRAR_PDF_ORIGINAL', motivo: 'Archivar el PDF oficial original.' })
    expect(requestBody(fetch.mock.calls[2]).pdfBase64).toBeUndefined()
  })

  it('envía directamente una migración pequeña con confirmación, motivo y versión exacta', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, reference: 'certificate-drive:drive-migrated', hash: 'f'.repeat(64) }))

    await api.migrarPdfCertificadoPrivado('INS-2', {
      certificateId: 'CERT-7', pdfBase64: 'JVBERi0xLjQ=', pdfHash: 'f'.repeat(64),
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 7,
      motivo: 'Centralizar el original recuperado.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requestBody(fetch.mock.calls[0])).toMatchObject({ action: 'migrarPdfCertificadoPrivado', id: 'INS-2',
      certificateId: 'CERT-7', certificateVersion: 7, confirmacion: 'MIGRAR_PDF_ORIGINAL' })
  })

  it('falla de forma explícita si un PDF grande requiere desplegar primero el backend por fragmentos', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Acción no reconocida.' }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Acción no reconocida.' }))

    await expect(api.guardarPdfCertificadoPrivado('CERT-1', {
      pdfBase64: 'A'.repeat(3000004), pdfHash: 'd'.repeat(64), templateVersion: 'ra-security-2026-v2', certificateVersion: 1,
    })).rejects.toMatchObject({ code: 'PDF_CHUNK_BACKEND_REQUIRED' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(requestBody(fetch.mock.calls[0]).action).toBe('guardarPdfPrivadoChunk')
    expect(fetch.mock.calls.some(call => requestBody(call).action === 'guardarPdfCertificadoPrivado')).toBe(false)
  })
})
