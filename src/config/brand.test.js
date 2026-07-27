import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { BRAND, detectCertificateEnvironment, resolveCertificatePublicBaseUrl } from './brand'

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
    expect(fs.existsSync(path.join(root, 'src/assets/brand/logo-ra-training-on-light.png'))).toBe(true)
  })

  it.each([
    ['favicon-16x16.png', 16],
    ['favicon-32x32.png', 32],
    ['favicon-48x48.png', 48],
    ['apple-touch-icon.png', 180],
    ['icon-512x512.png', 512],
  ])('mantiene el isotipo legible sobre fondo azul en %s', (filename, size) => {
    const image = PNG.sync.read(fs.readFileSync(path.join(root, 'public', filename)))
    expect([image.width, image.height]).toEqual([size, size])

    let bluePixels = 0
    let whitePixels = 0
    let orangePixels = 0
    for (let index = 0; index < image.data.length; index += 4) {
      const [red, green, blue, alpha] = image.data.subarray(index, index + 4)
      if (alpha > 180 && red < 70 && green >= 45 && green < 135 && blue > 100) bluePixels += 1
      if (alpha > 180 && red > 220 && green > 220 && blue > 220) whitePixels += 1
      if (alpha > 180 && red > 190 && green >= 45 && green < 170 && blue < 120) orangePixels += 1
    }

    expect(image.data[3]).toBe(0)
    expect(bluePixels).toBeGreaterThan(size * size * 0.25)
    expect(whitePixels).toBeGreaterThan(0)
    expect(orangePixels).toBeGreaterThan(0)
  })

  it('incluye metadatos públicos coherentes', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    expect(html).toContain('<title>R.A. Training Finance</title>')
    expect(html).toContain('Sistema de gestión financiera y certificación')
    expect(html).toContain('/favicon-16x16.png')
    expect(html).toContain('/favicon-32x32.png')
    expect(html).toContain('/favicon-48x48.png')
    expect(html).toContain('/apple-touch-icon.png')
    expect(html).toContain('/site.webmanifest')
  })
})

describe('URL pública canónica de certificados', () => {
  it('detecta la URL de rama de Vercel como Preview sin depender de producción', () => {
    expect(detectCertificateEnvironment({
      hostname: 'ra-training-finance-git-6fb352-researchassesor-sources-projects.vercel.app',
    })).toBe('preview')
  })

  it('usa VERCEL_ENV como fuente autoritativa para un deployment productivo', () => {
    expect(detectCertificateEnvironment({
      platform: 'production',
      explicit: 'preview',
      hostname: 'ra-training-finance-researchassesor-sources-projects.vercel.app',
    })).toBe('production')
  })

  it('mantiene Preview cuando Vercel identifica el deployment como Preview', () => {
    expect(detectCertificateEnvironment({
      platform: 'preview',
      explicit: 'production',
      hostname: 'ra-training-finance-2vscplbfz-researchassesor-sources-projects.vercel.app',
    })).toBe('preview')
  })

  it('no confunde el dominio productivo de Vercel con una Preview por sus guiones', () => {
    expect(detectCertificateEnvironment({
      hostname: 'ra-training-finance-researchassesor-sources-projects.vercel.app',
    })).toBe('production')
  })

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
