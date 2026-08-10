import { describe, it, expect } from 'vitest'
import {
  MoneyError,
  toCents,
  formatCents,
  lineTotalCents,
  applyDiscountCents,
  taxCents,
  computeInvoiceTotals,
} from './money.js'

describe('toCents', () => {
  it('convierte decimales exactos de 2 dígitos', () => {
    expect(toCents('19.99')).toBe(1999)
    expect(toCents(1)).toBe(100)
    expect(toCents('0.01')).toBe(1)
  })

  it('no arrastra error de coma flotante binaria (caso clásico 0.1 + 0.2)', () => {
    // Si esto se hiciera con Number, 0.1 + 0.2 !== 0.3 en JS.
    expect(toCents('0.10') + toCents('0.20')).toBe(toCents('0.30'))
  })

  it('rechaza más de 2 decimales en vez de redondear en silencio', () => {
    expect(() => toCents('1.999')).toThrow(MoneyError)
  })

  it('rechaza valores no numéricos', () => {
    expect(() => toCents('abc')).toThrow(MoneyError)
  })

  it('soporta negativos (ej. ajustes)', () => {
    expect(toCents('-5.50')).toBe(-550)
  })
})

describe('formatCents', () => {
  it('formatea centavos como decimal de 2 dígitos', () => {
    expect(formatCents(100)).toBe('USD 1.00')
    expect(formatCents(1)).toBe('USD 0.01')
    expect(formatCents(0)).toBe('USD 0.00')
  })
})

describe('lineTotalCents', () => {
  it('multiplica precio unitario por cantidad entera', () => {
    expect(lineTotalCents(100, 3)).toBe(300)
  })

  it('soporta cantidades con decimales (regla explícita del prompt maestro)', () => {
    expect(lineTotalCents(100, 1.5)).toBe(150)
    expect(lineTotalCents(333, 3)).toBe(999)
  })

  it('redondea half-up una sola vez, de forma determinista', () => {
    // 1 centavo * 0.5 = 0.5 -> redondea a 1, no queda a la deriva del binario flotante.
    expect(lineTotalCents(1, 0.5)).toBe(1)
  })
})

describe('applyDiscountCents', () => {
  it('resta el descuento del total de línea', () => {
    expect(applyDiscountCents(1000, 100)).toBe(900)
  })

  it('rechaza un descuento mayor al total de línea', () => {
    expect(() => applyDiscountCents(1000, 1001)).toThrow(MoneyError)
  })

  it('rechaza descuentos negativos', () => {
    expect(() => applyDiscountCents(1000, -1)).toThrow(MoneyError)
  })
})

describe('taxCents', () => {
  it('IVA 0% siempre da 0, sin importar la base', () => {
    expect(taxCents(123456, 0)).toBe(0)
  })

  it('calcula un porcentaje distinto de 0 con redondeo half-up', () => {
    // 15% de 10.00 = 1.50
    expect(taxCents(1000, 1500)).toBe(150)
    // 15% de 0.05 = 0.0075 -> redondea a 1 centavo
    expect(taxCents(5, 1500)).toBe(1)
  })
})

describe('computeInvoiceTotals', () => {
  it('factura de un solo ítem con IVA 0% (caso de la prueba SRI: 1 x USD 1.00)', () => {
    const totals = computeInvoiceTotals([{ baseCents: 100, taxRateBasisPoints: 0 }])
    expect(totals).toEqual({
      subtotalWithoutTax: 100,
      subtotal0: 100,
      subtotalTaxed: 0,
      taxTotal: 0,
      grandTotal: 100,
    })
  })

  it('múltiples ítems mixtos: algunos 0%, otros con impuesto', () => {
    const totals = computeInvoiceTotals([
      { baseCents: 100, taxRateBasisPoints: 0 },
      { baseCents: 1000, taxRateBasisPoints: 1500 },
      { baseCents: 250, taxRateBasisPoints: 0 },
    ])
    expect(totals.subtotal0).toBe(350)
    expect(totals.subtotalTaxed).toBe(1000)
    expect(totals.taxTotal).toBe(150)
    expect(totals.grandTotal).toBe(1500)
  })

  it('descuento aplicado antes de calcular totales (vía applyDiscountCents en el ítem)', () => {
    const lineAfterDiscount = applyDiscountCents(lineTotalCents(1000, 2), 500)
    const totals = computeInvoiceTotals([{ baseCents: lineAfterDiscount, taxRateBasisPoints: 0 }])
    expect(totals.grandTotal).toBe(1500)
  })

  it('rechaza una lista vacía de ítems', () => {
    expect(() => computeInvoiceTotals([])).toThrow(MoneyError)
  })
})
