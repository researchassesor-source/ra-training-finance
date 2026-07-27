import {
  isControlledCertificateRecoveryAvailable,
  withCertificateTimeout,
} from './certificateArtifactStore'

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_PREPARATION_TIMEOUT_MS = 45_000

function publicErrorMessage(error) {
  const fallback = 'No se pudo preparar el certificado. Inténtelo nuevamente o contacte al administrador.'
  const message = String(error?.message || '').replace(/[\u0000-\u001f]+/g, ' ').trim()
  if (!message || /\b(token|authorization|bearer|secret|password|contraseña|clave)\b/i.test(message)) return fallback
  return message.slice(0, 360)
}

function createElement(document, tag, attributes = {}, text = '') {
  const element = document.createElement(tag)
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
  if (text) element.textContent = text
  return element
}

function renderPreviewState(popup, { title, heading, message, tone = 'loading', recoverable = false, appHref = '' }) {
  const document = popup.document
  document.title = title
  document.documentElement.lang = 'es'
  const style = createElement(document, 'style')
  style.textContent = `
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f8fc; color: #102a4e; }
    main { width: min(560px, 100%); border: 1px solid #dce5f0; border-radius: 18px; background: white; box-shadow: 0 18px 50px rgba(13,54,115,.12); padding: 30px; text-align: center; }
    .mark { width: 54px; height: 54px; border-radius: 16px; margin: 0 auto 18px; display: grid; place-items: center; background: #114899; color: white; font-weight: 800; }
    .mark::after { content: ""; width: 18px; height: 18px; border: 4px solid currentColor; border-top-color: #f1871a; border-radius: 50%; animation: spin 1s linear infinite; }
    main.error .mark { background: #fff1f2; color: #b42318; }
    main.error .mark::after { content: "!"; width: auto; height: auto; border: 0; animation: none; font-size: 28px; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    p { margin: 0; color: #52657d; line-height: 1.55; }
    .help { margin-top: 14px; padding: 12px; border-radius: 10px; background: #fff8eb; color: #7a4b00; font-size: 14px; text-align: left; }
    .actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    button, a { border-radius: 9px; padding: 10px 16px; font: inherit; font-weight: 650; cursor: pointer; text-decoration: none; }
    button { border: 1px solid #cdd8e6; color: #102a4e; background: white; }
    a { color: white; background: #114899; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .mark::after { animation: none; } }
  `
  const main = createElement(document, 'main', tone === 'error' ? { class: 'error' } : {})
  main.append(createElement(document, 'div', { class: 'mark', 'aria-hidden': 'true' }))
  main.append(createElement(document, 'h1', {}, heading))
  main.append(createElement(document, 'p', { role: tone === 'error' ? 'alert' : 'status' }, message))
  if (recoverable) {
    main.append(createElement(
      document,
      'div',
      { class: 'help' },
      'El certificado histórico no será modificado automáticamente. Regrese al sistema y use la recuperación controlada para crear una nueva versión conservando el historial.',
    ))
  }
  if (tone === 'error') {
    const actions = createElement(document, 'div', { class: 'actions' })
    if (appHref) actions.append(createElement(document, 'a', { href: appHref }, 'Volver al sistema'))
    const close = createElement(document, 'button', { type: 'button' }, 'Cerrar esta pestaña')
    close.addEventListener('click', () => popup.close())
    actions.append(close)
    main.append(actions)
  }
  document.head.replaceChildren(style)
  document.body.replaceChildren(main)
}

export function openCertificatePreviewWindow({
  openWindow = () => window.open('', '_blank'),
  appHref = typeof window !== 'undefined' ? window.location.href : '',
  createObjectUrl = blob => URL.createObjectURL(blob),
  revokeObjectUrl = url => URL.revokeObjectURL(url),
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
} = {}) {
  let popup
  try {
    popup = openWindow()
  } catch {
    popup = null
  }
  if (!popup) {
    return {
      available: false,
      blocked: true,
      showStage() {},
      showError() {},
      showPdf() { return '' },
    }
  }

  try {
    popup.opener = null
    renderPreviewState(popup, {
      title: 'Generando certificado…',
      heading: 'Preparando certificado',
      message: 'Validando el artefacto oficial y su integridad SHA-256…',
      appHref,
    })
  } catch {
    try { popup.close() } catch { /* no-op */ }
    return {
      available: false,
      blocked: true,
      showStage() {},
      showError() {},
      showPdf() { return '' },
    }
  }

  return {
    available: true,
    blocked: false,
    showStage(message) {
      if (popup.closed) return
      renderPreviewState(popup, {
        title: 'Generando certificado…',
        heading: 'Preparando certificado',
        message,
        appHref,
      })
    },
    showError(error) {
      if (popup.closed) return
      renderPreviewState(popup, {
        title: 'No se pudo abrir el certificado',
        heading: 'No se pudo mostrar el certificado',
        message: publicErrorMessage(error),
        tone: 'error',
        recoverable: isControlledCertificateRecoveryAvailable(error),
        appHref,
      })
    },
    showPdf(blob) {
      if (popup.closed) throw new Error('La pestaña de vista previa fue cerrada antes de mostrar el PDF.')
      const objectUrl = createObjectUrl(blob)
      try {
        popup.location.replace(objectUrl)
      } catch (error) {
        revokeObjectUrl(objectUrl)
        throw error
      }
      schedule(() => revokeObjectUrl(objectUrl), 120_000)
      return objectUrl
    },
  }
}

function attachFlowContext(error, context) {
  const result = error instanceof Error ? error : new Error('No se pudo completar la descarga del certificado.')
  Object.assign(result, context)
  return result
}

async function step(promise, timeoutMs, message) {
  return withCertificateTimeout(
    promise,
    timeoutMs,
    'CERTIFICATE_DOWNLOAD_TIMEOUT',
    message,
  )
}

export async function downloadCertificateWithAudit({
  id,
  api,
  repository,
  preview,
  saveFile,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  preparationTimeoutMs = DEFAULT_PREPARATION_TIMEOUT_MS,
}) {
  let certificate = null
  let requestId = ''
  let deliveryStarted = false

  try {
    preview?.showStage('Consultando la versión oficial del certificado…')
    const current = await step(
      api.getCertificadoParaDescarga(id),
      requestTimeoutMs,
      'El servidor no respondió a tiempo al consultar el certificado.',
    )
    certificate = current?.data
    if (!certificate) throw new Error('El servidor no devolvió los datos del certificado solicitado.')

    preview?.showStage('Obteniendo el PDF y verificando su integridad SHA-256…')
    const prepared = await step(
      repository.prepare(certificate),
      preparationTimeoutMs,
      'La preparación del PDF excedió el tiempo permitido.',
    )

    preview?.showStage('Registrando el artefacto oficial…')
    await step(api.registrarArtefactoCertificado(id, {
      pdfHash: prepared.hash,
      pdfStorageReference: prepared.reference,
      templateVersion: prepared.templateVersion,
      certificateVersion: prepared.certificateVersion,
    }), requestTimeoutMs, 'El servidor no respondió a tiempo al registrar el PDF oficial.')

    preview?.showStage('Registrando la solicitud en la auditoría…')
    const request = await step(api.solicitarDescargaCertificado(id, {
      pdfHash: prepared.hash,
      pdfStorageReference: prepared.reference,
    }), requestTimeoutMs, 'La auditoría no respondió a tiempo antes de la descarga.')
    requestId = String(request?.requestId || '')
    if (!requestId) throw new Error('La auditoría no devolvió un identificador de solicitud válido.')

    saveFile(prepared.blob, prepared.filename)
    deliveryStarted = true

    let previewWarning = ''
    if (preview?.available) {
      try {
        preview.showPdf(prepared.blob)
      } catch {
        previewWarning = 'El PDF se descargó, pero el navegador no pudo mostrar la vista previa en la nueva pestaña.'
      }
    } else if (preview?.blocked) {
      previewWarning = 'El PDF se descargó, pero el navegador bloqueó la pestaña de vista previa. Permita ventanas emergentes para verla.'
    }

    try {
      await step(
        api.confirmarDescargaCertificado(requestId, 'completado'),
        requestTimeoutMs,
        'La confirmación final de auditoría no respondió a tiempo.',
      )
    } catch (error) {
      throw attachFlowContext(error, { deliveryStarted: true, auditPending: true, requestId, certificate })
    }

    return { ...prepared, certificate, previewWarning }
  } catch (error) {
    const flowError = attachFlowContext(error, { deliveryStarted, requestId, certificate })
    if (requestId && !deliveryStarted) {
      try {
        await step(
          api.confirmarDescargaCertificado(requestId, 'fallido', publicErrorMessage(flowError)),
          requestTimeoutMs,
          'La auditoría de fallo no respondió a tiempo.',
        )
      } catch {
        flowError.auditFailurePending = true
      }
    }
    if (!deliveryStarted) preview?.showError(flowError)
    throw flowError
  }
}

export { publicErrorMessage }
