import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { DocumentType } from '../domain/types.js'

export interface StoredFile {
  relativePath: string
  sha256: string
  size: number
}

export interface FiscalFileStorage {
  write(documentId: string, type: DocumentType, issueDate: string, relativeName: string, data: Buffer | string): Promise<StoredFile>
  read(relativePath: string): Promise<Buffer>
}

const safeDocumentId = /^FD-[a-f0-9-]{36}$/
const safeRelativeName = /^(?:[a-z0-9-]+\/)*[a-z0-9.-]+$/

export class LocalFileStorage implements FiscalFileStorage {
  private readonly root: string

  constructor(root = resolve(process.cwd(), 'var')) {
    this.root = resolve(root)
  }

  private contained(path: string): string {
    const resolved = resolve(this.root, path)
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${sep}`)) throw new Error('Ruta fuera del almacenamiento fiscal')
    return resolved
  }

  async write(
    documentId: string,
    type: DocumentType,
    issueDate: string,
    relativeName: string,
    data: Buffer | string,
  ): Promise<StoredFile> {
    if (!safeDocumentId.test(documentId)) throw new Error('ID de documento inválido')
    if (!safeRelativeName.test(relativeName) || relativeName.includes('..')) throw new Error('Nombre de archivo fiscal inválido')
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(issueDate)
    if (!match) throw new Error('Fecha de documento inválida para almacenamiento')
    const typeFolder = type === 'INVOICE' ? 'invoices' : 'credit-notes'
    const relativePath = `local/${typeFolder}/${match[1]}/${match[2]}/${documentId}/${relativeName}`
    const absolutePath = this.contained(relativePath)
    const content = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
    await mkdir(dirname(absolutePath), { recursive: true })
    const temporary = `${absolutePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, content, { flag: 'wx' })
    await rename(temporary, absolutePath)
    return {
      relativePath: relativePath.replaceAll('\\', '/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      size: content.length,
    }
  }

  async read(relativePath: string): Promise<Buffer> {
    if (relativePath.includes('..') || /^[a-zA-Z]:/.test(relativePath)) throw new Error('Ruta fiscal inválida')
    return readFile(this.contained(relativePath))
  }
}

export interface FuturePrivateObjectStorage extends FiscalFileStorage {
  readonly encryptedPrivateStorageRequired: true
}
