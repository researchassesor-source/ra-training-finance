function isTrue(value) {
  return value === true || String(value || '').toUpperCase() === 'TRUE'
}

function deploymentEnvironment(env) {
  const explicit = String(env?.VITE_DEPLOYMENT_ENV || '').trim().toLowerCase()
  if (['development', 'preview', 'production'].includes(explicit)) return explicit
  if (env?.MODE === 'test' || env?.DEV) return 'development'
  return 'production'
}

export function resolveAvalVisualConfiguration(certificate, env = {}) {
  const hasAval = isTrue(certificate?.RequiereAvalExterno) && certificate?.EstadoAval === 'avalado'
  const environment = deploymentEnvironment(env)
  const mode = String(env?.VITE_CERTIFICATE_AVAL_VISUAL_MODE || 'pending').trim().toLowerCase()
  if (!hasAval) return { visible: false, valid: true, environment, mode }
  if (mode === 'pending') {
    if (environment === 'production') {
      return {
        visible: true,
        valid: false,
        environment,
        mode,
        error: 'El bloque visual del aval institucional sigue pendiente de aprobación para Production.',
      }
    }
    return {
      visible: true,
      valid: true,
      environment,
      mode,
      title: 'AVAL INSTITUCIONAL',
      lines: ['Aval confirmado — información institucional', 'pendiente de plantilla final'],
    }
  }
  if (mode !== 'configured') {
    return { visible: true, valid: false, environment, mode, error: 'CERTIFICATE_AVAL_VISUAL_MODE no es válido.' }
  }
  const institution = String(certificate.InstitucionAval || '').trim()
  const reference = String(certificate.AvalCodigoExterno || certificate.AvalReferencia || '').trim()
  const confirmedText = String(certificate.AvalTextoConfirmado || '').trim()
  if (!institution || !reference || !confirmedText) {
    return {
      visible: true,
      valid: false,
      environment,
      mode,
      error: 'Faltan entidad, referencia y texto institucional confirmado para mostrar el aval.',
    }
  }
  const logo = String(certificate.AvalLogoDataUrl || '').startsWith('data:image/')
    ? certificate.AvalLogoDataUrl
    : ''
  return {
    visible: true,
    valid: true,
    environment,
    mode,
    title: 'AVAL INSTITUCIONAL',
    institution,
    reference,
    confirmedText,
    logo,
  }
}

export function certificateAvalVisualStatus(certificate) {
  return resolveAvalVisualConfiguration(certificate, import.meta.env)
}

