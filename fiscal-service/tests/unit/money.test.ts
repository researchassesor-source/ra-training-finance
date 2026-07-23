import { describe, expect, it } from 'vitest'
import { calculateDocument } from '../../src/domain/money.js'

describe('cálculos fiscales exactos', () => {
  it('calcula cantidad, descuento, base, impuesto y total con Decimal', () => {
    const result = calculateDocument('FD-test', [{
      mainCode: 'ITEM', description: 'Detalle ficticio', quantity: '3', unitPrice: '10.005', discount: '0.02',
      taxCode: '2', percentageCode: '4', rate: '15',
    }])
    expect(result.subtotal).toBe('30.02')
    expect(result.totalDiscount).toBe('0.02')
    expect(result.totalWithoutTaxes).toBe('30.00')
    expect(result.totalTaxes).toBe('4.50')
    expect(result.grandTotal).toBe('34.50')
  })

  it.each([
    ['0', '1', '0'],
    ['1', '-1', '0'],
    ['1', 'NaN', '0'],
    ['1', 'Infinity', '0'],
  ])('rechaza valores inválidos (q=%s, precio=%s)', (quantity, unitPrice, discount) => {
    expect(() => calculateDocument('FD-test', [{
      mainCode: 'ITEM', description: 'Detalle ficticio', quantity, unitPrice, discount,
      taxCode: '2', percentageCode: '0', rate: '0',
    }])).toThrow()
  })

  it('rechaza descuento superior al bruto', () => {
    expect(() => calculateDocument('FD-test', [{
      mainCode: 'ITEM', description: 'Detalle ficticio', quantity: '1', unitPrice: '10', discount: '10.01',
      taxCode: '2', percentageCode: '0', rate: '0',
    }])).toThrow('no puede superar')
  })
})
