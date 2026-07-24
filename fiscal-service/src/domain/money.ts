import { Decimal } from 'decimal.js'
import type { DraftItemInput, FiscalDocumentItem, FiscalTaxLine } from './types.js'

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

const money = (value: Decimal.Value): Decimal => new Decimal(value).toDecimalPlaces(2)
const moneyString = (value: Decimal.Value): string => money(value).toFixed(2)

export interface CalculatedDocument {
  subtotal: string
  totalDiscount: string
  totalWithoutTaxes: string
  totalTaxes: string
  grandTotal: string
  items: FiscalDocumentItem[]
  taxes: FiscalTaxLine[]
}

function finiteNonNegative(value: string, field: string, allowZero = true): Decimal {
  const parsed = new Decimal(value)
  if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero())) {
    throw new Error(`${field} debe ser un decimal ${allowZero ? 'no negativo' : 'mayor que cero'}`)
  }
  return parsed
}

export function calculateDocument(
  documentId: string,
  items: DraftItemInput[],
  now = new Date().toISOString(),
): CalculatedDocument {
  if (items.length === 0) throw new Error('La factura requiere al menos un detalle')

  let grossSubtotal = new Decimal(0)
  let totalDiscount = new Decimal(0)
  let totalWithoutTaxes = new Decimal(0)
  let totalTaxes = new Decimal(0)
  const calculatedItems: FiscalDocumentItem[] = []
  const taxes: FiscalTaxLine[] = []

  items.forEach((item, index) => {
    const quantity = finiteNonNegative(item.quantity, `items[${index}].quantity`, false)
    const unitPrice = finiteNonNegative(item.unitPrice, `items[${index}].unitPrice`)
    const discount = finiteNonNegative(item.discount, `items[${index}].discount`)
    const rate = finiteNonNegative(item.rate, `items[${index}].rate`)
    const gross = money(quantity.mul(unitPrice))
    if (discount.gt(gross)) throw new Error(`items[${index}].discount no puede superar el importe bruto`)
    const taxableBase = money(gross.minus(discount))
    const taxValue = money(taxableBase.mul(rate).div(100))
    const itemId = `${documentId}-item-${index + 1}`

    grossSubtotal = grossSubtotal.plus(gross)
    totalDiscount = totalDiscount.plus(discount)
    totalWithoutTaxes = totalWithoutTaxes.plus(taxableBase)
    totalTaxes = totalTaxes.plus(taxValue)
    calculatedItems.push({
      id: itemId,
      documentId,
      mainCode: item.mainCode,
      ...(item.auxiliaryCode ? { auxiliaryCode: item.auxiliaryCode } : {}),
      description: item.description,
      quantity: quantity.toFixed(6).replace(/\.?0+$/, ''),
      unitPrice: unitPrice.toFixed(6).replace(/\.?0+$/, ''),
      discount: moneyString(discount),
      subtotal: moneyString(taxableBase),
      fiscalClassificationValidated: item.fiscalClassificationValidated ?? false,
      ...(item.taxCategory ? { taxCategory: item.taxCategory } : {}),
      createdAt: now,
    })
    taxes.push({
      id: `${documentId}-tax-${index + 1}`,
      documentId,
      itemId,
      taxCode: item.taxCode,
      percentageCode: item.percentageCode,
      rate: rate.toFixed(2),
      taxableBase: moneyString(taxableBase),
      taxValue: moneyString(taxValue),
    })
  })

  const expected = money(grossSubtotal.minus(totalDiscount))
  const base = money(totalWithoutTaxes)
  if (!expected.eq(base)) throw new Error('La suma de líneas no coincide con la cabecera')

  return {
    subtotal: moneyString(grossSubtotal),
    totalDiscount: moneyString(totalDiscount),
    totalWithoutTaxes: moneyString(base),
    totalTaxes: moneyString(totalTaxes),
    grandTotal: moneyString(base.plus(totalTaxes)),
    items: calculatedItems,
    taxes,
  }
}

export const compareMoney = (left: string, right: string): number => new Decimal(left).cmp(new Decimal(right))
export const formatMoney = moneyString
