/**
 * Datos del emisor y ambiente activo. El ambiente NUNCA se toma de un parámetro
 * enviado por el navegador (regla 9 del prompt maestro) — viene de la variable de
 * entorno server-only SRI_ENVIRONMENT, con "test" como valor por defecto seguro
 * (nunca "production" por omisión).
 */

export function getActiveEnvironment(env = process.env) {
  return env.SRI_ENVIRONMENT === 'production' ? 'production' : 'test'
}

export function getEmisorConfig(env = process.env) {
  return {
    ruc: env.SRI_ISSUER_RUC || '0691787373001',
    razonSocial: env.SRI_ISSUER_RAZON_SOCIAL || 'RESEARCH ASSESSOR TRAINING S.A.S.',
    nombreComercial: env.SRI_ISSUER_NOMBRE_COMERCIAL || 'RA-TRAINING',
    dirMatriz: env.SRI_ISSUER_DIR_MATRIZ || 'Barrio de los Maestros, calle Bielorusia, Riobamba, Chimborazo',
    obligadoContabilidad: true,
  }
}
