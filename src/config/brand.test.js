import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND, resolveCertificatePublicBaseUrl } from './brand'

const root = process.cwd()

describe('identidad corporativa', () => {
  it('expone el nombre y subtítulo aprobados', () => {
    expect(BRAND.fullName).toBe('R.A. Training Finance')
    expect(BRAND.subtitle).toBe('Sistema de gestión financiera y certificación')
  })

  it('declara tokens y recursos principales', () => {
    const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
    expect(css).toContain('--brand-primary: #114899')
    expect(css).toContain('--brand-secondary: #f1871a')
    expect(fs.existsSync(path.join(root, 'src/assets/brand/logo-ra-training.webp'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'public/favicon.png'))).toBe(true)
  })

  it('incluye metadatos públicos coherentes', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    expect(html).toContain('<title>R.A. Training Finance</title>')
    expect(html).toContain('Sistema de gestión financiera y certificación')
    expect(html).toContain('/favicon.png')
  })
})

describe('URL pública canónica de certificados', () => {
  it('permite el origen local únicamente en desarrollo', () => {
    expect(resolveCertificatePublicBaseUrl({ environment: 'development', browserOrigin: 'http://localhost:5173' }))
      .toMatchObject({ valid: true, url: 'http://localhost:5173' })
  })

  it.each(['preview', 'production'])('exige URL configurada en %s', environment => {
    expect(resolveCertificatePublicBaseUrl({ environment })).toMatchObject({ valid: false, environment })
    expect(resolveCertificatePublicBaseUrl({ environment, configuredUrl: 'http://localhost:5173' }).valid).toBe(false)
  })

  it('rechaza URL inválida y acepta la URL oficial HTTPS', () => {
    expect(resolveCertificatePublicBaseUrl({ environment: 'preview', configuredUrl: 'no-es-url' }).valid).toBe(false)
    expect(resolveCertificatePublicBaseUrl({ environment: 'production', configuredUrl: 'https://finance.ra-training.com/' }))
      .toMatchObject({ valid: true, url: 'https://finance.ra-training.com' })
  })
})
