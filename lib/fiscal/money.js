/**
 * Aritmética monetaria en centavos (enteros). Nunca usar Number para sumar/multiplicar
 * dinero directamente: el binario IEEE-754 no representa exactamente la mayoría de los
 * decimales (0.1 + 0.2 !== 0.3), y una factura fiscal no puede arrastrar ese error.
 */

const CENTS_PER_UNIT = 100
const QUANTITY_MICROS = 1_000_000n

export class MoneyError extends Error {}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} debe ser un número finito, recibido: ${String(value)}`)
  }
}

/**
 * Convierte un monto decimal (número o string, ej. "19.99") a centavos enteros.
 * Rechaza más de 2 decimales en vez de redondear en silencio.
 */
export function toCents(amount) {
  const raw = typeof amount === 'number' ? amount.toString() : String(amount).trim()
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(raw)
  if (!match) {
    throw new MoneyError(`Monto inválido: "${amount}". Se esperaba un decimal con máximo 2 decimales.`)
  }
  const [, intPart, fracPart = ''] = match
  const fracPadded = (fracPart + '00').slice(0, 2)
  const sign = intPart.startsWith('-') ? -1n : 1n
  const intAbs = BigInt(intPart.replace('-', ''))
  const cents = intAbs * BigInt(CENTS_PER_UNIT) + BigInt(fracPadded)
  return Number(sign * cents)
}

/** Formatea centavos enteros como string decimal "USD 1234.56" (uso técnico/log, no locale de UI). */
export function formatCents(cents, { currency = 'USD' } = {}) {
  if (!Number.isInteger(cents)) {
    throw new MoneyError(`formatCents espera un entero de centavos, recibido: ${cents}`)
  }
  const negative = cents < 0
  const abs = Math.abs(cents)
  const intPart = Math.floor(abs / CENTS_PER_UNIT)
  const fracPart = String(abs % CENTS_PER_UNIT).padStart(2, '0')
  return `${negative ? '-' : ''}${currency} ${intPart}.${fracPart}`
}

/** Centavos enteros -> string decimal de 2 dígitos sin prefijo de moneda, ej. "1.00". Formato exigido por los campos monetarios del XSD de factura del SRI. */
export function centsToDecimalString(cents) {
  if (!Number.isInteger(cents)) {
    throw new MoneyError(`centsToDecimalString espera un entero de centavos, recibido: ${cents}`)
  }
  const negative = cents < 0
  const abs = Math.abs(cents)
  const intPart = Math.floor(abs / CENTS_PER_UNIT)
  const fracPart = String(abs % CENTS_PER_UNIT).padStart(2, '0')
  return `${negative ? '-' : ''}${intPart}.${fracPart}`
}

/** Cantidad decimal -> string de 6 dígitos, ej. "1.500000". Formato exigido por <cantidad>/<precioUnitario> en el XSD de factura 2.1.0 del SRI (totalDigits=18, fractionDigits=6). */
export function formatQuantity6(quantity) {
  const micros = toQuantityMicros(quantity)
  const negative = micros < 0n
  const abs = negative ? -micros : micros
  const intPart = abs / QUANTITY_MICROS
  const fracPart = (abs % QUANTITY_MICROS).toString().padStart(6, '0')
  return `${negative ? '-' : ''}${intPart}.${fracPart}`
}

/**
 * Convierte una cantidad decimal (ej. 1.5 horas, 2 unidades) a micro-unidades enteras
 * (1e6) para poder multiplicar por precio-en-centavos sin usar floats.
 */
export function toQuantityMicros(quantity) {
  assertFiniteNumber(quantity, 'quantity')
  if (quantity < 0) throw new MoneyError('La cantidad no puede ser negativa.')
  // Redondeo único y documentado a 6 decimales; evita arrastrar error de coma flotante.
  return BigInt(Math.round(quantity * 1_000_000))
}

/** unitPriceCents * quantity -> total de línea en centavos (redondeado una sola vez, half-up). */
export function lineTotalCents(unitPriceCents, quantity) {
  if (!Number.isInteger(unitPriceCents)) {
    throw new MoneyError(`unitPriceCents debe ser entero, recibido: ${unitPriceCents}`)
  }
  const micros = toQuantityMicros(quantity)
  const product = BigInt(unitPriceCents) * micros
  const half = QUANTITY_MICROS / 2n
  const rounded = (product + (product >= 0n ? half : -half)) / QUANTITY_MICROS
  return Number(rounded)
}

/** Aplica un descuento (en centavos) a un total de línea, sin permitir negativos. */
export function applyDiscountCents(lineCents, discountCents = 0) {
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new MoneyError(`discountCents inválido: ${discountCents}`)
  }
  if (discountCents > lineCents) {
    throw new MoneyError(`El descuento (${discountCents}) no puede superar el total de línea (${lineCents}).`)
  }
  return lineCents - discountCents
}

/**
 * Calcula impuesto sobre una base en centavos usando puntos básicos (1500 = 15%, 0 = 0%).
 * Redondeo half-up al centavo, único punto de redondeo del impuesto.
 */
export function taxCents(baseCents, taxRateBasisPoints) {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new MoneyError(`baseCents inválido: ${baseCents}`)
  }
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0) {
    throw new MoneyError(`taxRateBasisPoints inválido: ${taxRateBasisPoints}`)
  }
  const numerator = BigInt(baseCents) * BigInt(taxRateBasisPoints)
  const denominator = 10_000n
  const half = denominator / 2n
  return Number((numerator + half) / denominator)
}

/**
 * Totales de una factura a partir de ítems ya reducidos a centavos.
 * item: { baseCents: number, taxRateBasisPoints: number }
 * No decide el catálogo de tarifas permitidas (eso es responsabilidad de la capa de
 * configuración fiscal) — solo suma lo que se le entrega.
 */
export function computeInvoiceTotals(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new MoneyError('computeInvoiceTotals requiere al menos un ítem.')
  }
  let subtotalWithoutTax = 0
  let subtotal0 = 0
  let subtotalTaxed = 0
  let taxTotal = 0

  for (const item of items) {
    if (!Number.isInteger(item.baseCents) || item.baseCents < 0) {
      throw new MoneyError(`baseCents inválido en ítem: ${JSON.stringify(item)}`)
    }
    subtotalWithoutTax += item.baseCents
    if (item.taxRateBasisPoints === 0) {
      subtotal0 += item.baseCents
    } else {
      subtotalTaxed += item.baseCents
      taxTotal += taxCents(item.baseCents, item.taxRateBasisPoints)
    }
  }

  return {
    subtotalWithoutTax,
    subtotal0,
    subtotalTaxed,
    taxTotal,
    grandTotal: subtotalWithoutTax + taxTotal,
  }
}
