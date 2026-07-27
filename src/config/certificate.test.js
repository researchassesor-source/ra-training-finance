import { describe, expect, it } from 'vitest'
import { resolveAvalVisualConfiguration } from './certificate'

const endorsed = { RequiereAvalExterno: true, EstadoAval: 'avalado' }

describe('configuración visual del aval', () => {
  it('muestra la leyenda pendiente solo fuera de Production', () => {
    expect(resolveAvalVisualConfiguration(endorsed, {
      VITE_DEPLOYMENT_ENV: 'preview', VITE_CERTIFICATE_AVAL_VISUAL_MODE: 'pending',
    })).toMatchObject({ visible: true, valid: true, mode: 'pending' })
    expect(resolveAvalVisualConfiguration(endorsed, {
      VITE_DEPLOYMENT_ENV: 'production', VITE_CERTIFICATE_AVAL_VISUAL_MODE: 'pending',
    })).toMatchObject({ visible: true, valid: false })
  })

  it('no inventa un aval configurado y exige todos los campos institucionales', () => {
    expect(resolveAvalVisualConfiguration(endorsed, {
      VITE_DEPLOYMENT_ENV: 'preview', VITE_CERTIFICATE_AVAL_VISUAL_MODE: 'configured',
    }).valid).toBe(false)
    expect(resolveAvalVisualConfiguration({
      ...endorsed,
      InstitucionAval: 'Institución de prueba',
      AvalCodigoExterno: 'AVAL-TEST-001',
      AvalTextoConfirmado: 'Texto aprobado para pruebas.',
    }, {
      VITE_DEPLOYMENT_ENV: 'production', VITE_CERTIFICATE_AVAL_VISUAL_MODE: 'configured',
    })).toMatchObject({ valid: true, institution: 'Institución de prueba', reference: 'AVAL-TEST-001' })
  })
})

