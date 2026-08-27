import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Apps Script ejecuta todos los archivos .gs del proyecto en un único ámbito global
// compartido (no son módulos ES separados). Concatenar aquí simula eso fielmente para
// las pruebas. Fiscal.gs es opcional: solo se incluye si ya existe en el checkout.
const GAS_FILES = ['Code.gs', 'Fiscal.gs']
const code = GAS_FILES
  .map(name => path.join(process.cwd(), 'apps-script', name))
  .filter(filePath => fs.existsSync(filePath))
  .map(filePath => fs.readFileSync(filePath, 'utf8'))
  .join('\n\n')

function sourceHeaders(name) {
  const match = code.match(new RegExp(`(?:^|\\n)\\s*${name}:\\s*\\[(.*?)\\]`, 's'))
  if (!match) throw new Error(`No se encontraron encabezados para ${name}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1])
}

class Range {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    Object.assign(this, { sheet, row, column, rowCount, columnCount })
  }

  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) => (
      Array.from({ length: this.columnCount }, (_, columnOffset) => (
        this.sheet.rows[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
      ))
    ))
  }

  getFormulas() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) => (
      Array.from({ length: this.columnCount }, (_, columnOffset) => (
        this.sheet.formulas[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
      ))
    ))
  }

  setValue(value) {
    while (this.sheet.rows.length < this.row) this.sheet.rows.push([])
    this.sheet.rows[this.row - 1][this.column - 1] = value
    return this
  }

  setValues(values) {
    values.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
      new Range(this.sheet, this.row + rowOffset, this.column + columnOffset).setValue(value)
    }))
    return this
  }

  setFontWeight() { return this }
  setBackground() { return this }
  setFontColor() { return this }
  setNumberFormat(format) {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        const rowIndex = this.row - 1 + rowOffset
        const columnIndex = this.column - 1 + columnOffset
        while (this.sheet.formats.length <= rowIndex) this.sheet.formats.push([])
        this.sheet.formats[rowIndex][columnIndex] = format
      }
    }
    return this
  }
}

class Sheet {
  constructor(name, rows = []) {
    this.name = name
    this.rows = rows
    this.formulas = rows.map(row => row.map(() => ''))
    this.formats = rows.map(row => row.map(() => ''))
  }

  getDataRange() { return new Range(this, 1, 1, this.rows.length, this.getLastColumn()) }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)) }
  getLastRow() { return this.rows.length }
  getRange(row, column, rowCount, columnCount) { return new Range(this, row, column, rowCount, columnCount) }
  appendRow(row) { this.rows.push([...row]); this.formulas.push(row.map(() => '')); this.formats.push(row.map(() => '')) }
  deleteRow(row) { this.rows.splice(row - 1, 1); this.formulas.splice(row - 1, 1); this.formats.splice(row - 1, 1) }
  setFrozenRows() {}
}

export function createAppsScriptHarness({ authSecret = 'test-only-secret-with-at-least-32-characters' } = {}) {
  const sheets = {}
  const driveFiles = new Map()
  const driveFolders = new Map()
  const locks = { waits: 0, releases: 0 }
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = new Sheet(name)),
  }
  const properties = new Map(authSecret ? [['AUTH_SECRET', authSecret]] : [])
  const logs = []
  function makeBlob(bytes, mimeType = '', name = '') {
    const normalized = Array.isArray(bytes)
      ? bytes
      : typeof bytes === 'string'
        ? [...Buffer.from(bytes, 'utf8')]
        : [...Buffer.from(bytes || [])]
    return {
      bytes: normalized,
      mimeType,
      name,
      getBytes: () => normalized,
      getName: () => name,
      getContentType: () => mimeType,
    }
  }

  function makeFile(blob) {
    const id = `drive-${driveFiles.size + 1}`
    const file = {
      id,
      blob,
      getId: () => id,
      getName: () => blob.getName ? blob.getName() : blob.name,
      getBlob: () => blob,
      setSharing: () => file,
    }
    driveFiles.set(id, file)
    return file
  }

  function makeFolder(name) {
    const folder = {
      name,
      createFile: blob => makeFile(blob),
      getName: () => name,
    }
    driveFolders.set(name, folder)
    return folder
  }

  const context = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => {} },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, removeAll: () => {} }) },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { locks.waits += 1 },
        releaseLock: () => { locks.releases += 1 },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => properties.get(key) || null,
        setProperty: (key, value) => properties.set(key, value),
        deleteProperty: key => properties.delete(key),
      }),
    },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: value => ({ setMimeType: () => value }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => {
        const input = Array.isArray(value) ? Buffer.from(value) : Buffer.from(String(value), 'utf8')
        return [...crypto.createHash('sha256').update(input).digest()]
      },
      base64Decode: value => [...Buffer.from(value, 'base64')],
      base64Encode: value => Buffer.from(Array.isArray(value) ? value : String(value), Array.isArray(value) ? undefined : 'utf8').toString('base64'),
      newBlob: (bytes, mimeType, name) => makeBlob(bytes, mimeType, name),
      getUuid: () => crypto.randomUUID(),
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' },
      Permission: { NONE: 'NONE' },
      createFolder: name => makeFolder(name),
      getFoldersByName: name => {
        const folder = driveFolders.get(name)
        let consumed = false
        return { hasNext: () => Boolean(folder) && !consumed, next: () => { consumed = true; return folder } }
      },
      getFolderById: id => driveFolders.get(id) || makeFolder(id),
      createFile: blob => makeFile(blob),
      getFileById: id => {
        if (!driveFiles.has(id)) throw new Error(`Drive file not found: ${id}`)
        return driveFiles.get(id)
      },
    },
    MailApp: { sendEmail: () => {} },
    Logger: { log: value => logs.push(String(value)) },
  }
  vm.createContext(context)
  vm.runInContext(code, context)

  function ensureSheet(name) {
    if (!sheets[name]) sheets[name] = new Sheet(name, [sourceHeaders(name)])
    return sheets[name]
  }

  function seed(name, objects) {
    const sheet = ensureSheet(name)
    const headers = sourceHeaders(name)
    objects.forEach(object => sheet.appendRow(headers.map(header => object[header] ?? '')))
    return sheet
  }

  function objects(name) {
    const sheet = ensureSheet(name)
    const [headers, ...rows] = sheet.rows
    return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  }

  return { code, context, driveFiles, driveFolders, ensureSheet, locks, logs, objects, properties, seed, sheets, sourceHeaders }
}
