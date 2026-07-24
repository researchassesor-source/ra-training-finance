import type { FiscalConfig } from '../config/env.js'
import type { IssuerConfig } from '../domain/types.js'
import type { FiscalCatalogItem } from './operational-services.js'

export type ReadinessStatus = 'READY' | 'PARTIAL' | 'BLOCKED' | 'REQUIRES_CONFIRMATION' | 'REQUIRES_CERTIFICATE' | 'REQUIRES_CERTIFICATION'
export interface ReadinessCheck { key: string; label: string; status: ReadinessStatus; detail: string }

const pending = (value: string | undefined): boolean => !value || value === 'PENDING_CONFIRMATION'

export class FiscalReadinessService {
  constructor(private readonly config: FiscalConfig, private readonly issuer: IssuerConfig) {}

  evaluate(catalog: FiscalCatalogItem[]): { status: ReadinessStatus; ready: boolean; checks: ReadinessCheck[]; officialBlockers: string[] } {
    const checks: ReadinessCheck[] = [
      { key: 'issuer', label: 'Datos básicos del emisor', status: this.issuer.rucPlaceholder && this.issuer.businessName ? 'READY' : 'BLOCKED', detail: 'RUC, razón social y nombre comercial cargados desde configuración privada.' },
      { key: 'address', label: 'Dirección oficial', status: pending(this.issuer.headOfficeAddress) || pending(this.issuer.establishmentAddress) ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'La dirección matriz y del establecimiento deben coincidir con el RUC.' },
      { key: 'accounting', label: 'Obligación contable', status: this.issuer.accountingObligationConfirmed ? 'READY' : 'REQUIRES_CONFIRMATION', detail: 'Dato tributario institucional pendiente de confirmación.' },
      { key: 'establishment', label: 'Establecimiento 001', status: this.config.FISCAL_ESTABLISHMENT_CODE ? 'PARTIAL' : 'BLOCKED', detail: 'Código disponible; texto y dirección exactos pendientes.' },
      { key: 'emissionPoint', label: 'Punto de emisión 001', status: this.config.FISCAL_EMISSION_POINT_CODE ? 'PARTIAL' : 'BLOCKED', detail: 'Código disponible; secuencial real pendiente.' },
      { key: 'sequence', label: 'Secuencial real', status: pending(this.config.FISCAL_SEQUENCE_START) ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'No se reutilizan secuenciales simulados.' },
      { key: 'catalog', label: 'Catálogo fiscal', status: catalog.some((item) => item.status !== 'VALIDATED') ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'Todo servicio real requiere clasificación tributaria validada.' },
      { key: 'certificate', label: 'Firma electrónica', status: this.config.FISCAL_CERT_PATH ? 'PARTIAL' : 'REQUIRES_CERTIFICATE', detail: 'Se requiere archivo .p12/.pfx vigente y secreto externo.' },
      { key: 'postgres', label: 'PostgreSQL', status: this.config.FISCAL_STORAGE === 'postgres' ? 'PARTIAL' : 'BLOCKED', detail: 'Adaptador local preparado; PostgreSQL real no activo.' },
      { key: 'sri', label: 'Adaptador SRI', status: 'REQUIRES_CERTIFICATION', detail: 'Implementado y doblemente bloqueado; falta certificación formal.' },
      { key: 'authentication', label: 'Autenticación productiva', status: 'BLOCKED', detail: 'Pendiente integrar sesión y permisos institucionales.' },
      { key: 'storage', label: 'Almacenamiento privado', status: 'BLOCKED', detail: 'El almacenamiento local no sustituye un repositorio privado productivo.' },
      { key: 'mail', label: 'Correo productivo', status: 'BLOCKED', detail: 'Solo existe preview y envío simulado.' },
    ]
    const officialBlockers = checks.filter((item) => item.status !== 'READY').map((item) => item.label)
    return { status: officialBlockers.length ? 'BLOCKED' : 'READY', ready: officialBlockers.length === 0, checks, officialBlockers }
  }
}
