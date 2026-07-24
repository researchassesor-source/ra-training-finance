const toBoolean = (value) => String(value ?? '').trim().toLowerCase() === 'true'

const parseCsvRows = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field.trim()); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field.trim()); field = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

const valueOf = (item, camel, snake) => item?.[camel] ?? item?.[snake] ?? ''

const normalizeItem = (item, index) => {
  const normalized = {
    operationalId: String(valueOf(item, 'operationalId', 'operational_id')).trim(),
    mainCode: String(valueOf(item, 'mainCode', 'main_code')).trim(),
    auxiliaryCode: String(valueOf(item, 'auxiliaryCode', 'auxiliary_code')).trim(),
    operationalName: String(valueOf(item, 'operationalName', 'operational_name')).trim(),
    operationalDescription: String(valueOf(item, 'operationalDescription', 'operational_description')).trim(),
    invoiceDescription: String(valueOf(item, 'invoiceDescription', 'invoice_description')).trim(),
    referencePrice: String(valueOf(item, 'referencePrice', 'reference_price')).trim(),
    priceIncludesTax: toBoolean(valueOf(item, 'priceIncludesTax', 'price_includes_tax')),
    taxCode: String(valueOf(item, 'taxCode', 'tax_code')).trim(),
    percentageCode: String(valueOf(item, 'percentageCode', 'percentage_code')).trim(),
    rate: String(valueOf(item, 'rate', 'rate')).trim(),
    exempt: toBoolean(valueOf(item, 'exempt', 'exempt')),
    notSubject: toBoolean(valueOf(item, 'notSubject', 'not_subject')),
    fiscalCategory: String(valueOf(item, 'fiscalCategory', 'fiscal_category')).trim(),
    activeForBilling: false,
    status: 'REQUIRES_TAX_REVIEW',
    validatedAt: '',
    validatedBy: '',
  }
  if (!normalized.operationalId || !normalized.operationalName || !normalized.invoiceDescription || !/^\d+(\.\d{1,2})?$/.test(normalized.referencePrice)) {
    throw new Error(`Fila ${index + 1}: ID, nombre, descripción y precio válido son obligatorios`)
  }
  return normalized
}

export function importFiscalCatalogJson(text) {
  const parsed = JSON.parse(String(text || ''))
  if (!Array.isArray(parsed)) throw new Error('El JSON debe contener una lista de servicios')
  return parsed.map(normalizeItem)
}

export function importFiscalCatalogCsv(text) {
  const [headers, ...rows] = parseCsvRows(text)
  if (!headers?.length) throw new Error('El CSV está vacío')
  return rows.map((values, index) => normalizeItem(Object.fromEntries(headers.map((header, position) => [header, values[position] ?? ''])), index))
}
