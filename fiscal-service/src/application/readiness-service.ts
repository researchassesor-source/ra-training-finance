import type { FiscalConfig } from '../config/env.js'
import type { IssuerConfig } from '../domain/types.js'
import type { FiscalCatalogItem } from './operational-services.js'

export type ReadinessStatus = 'READY' | 'PARTIAL' | 'BLOCKED' | 'REQUIRES_CONFIRMATION' | 'REQUIRES_CERTIFICATE' | 'REQUIRES_CERTIFICATION'
export type ReadinessGroup = 'CERTIFICATION_REQUIRED' | 'PRODUCTION_REQUIRED' | 'RECOMMENDED_INFRASTRUCTURE'
export interface ReadinessCheck { key: string; label: string; status: ReadinessStatus; detail: string; group: ReadinessGroup }

const pending = (value: string | undefined): boolean => !value || value === 'PENDING_CONFIRMATION'

export class FiscalReadinessService {
  constructor(private readonly config: FiscalConfig, private readonly issuer: IssuerConfig) {}

  evaluate(catalog: FiscalCatalogItem[]): { status: ReadinessStatus; ready: boolean; checks: ReadinessCheck[]; officialBlockers: string[] } {
    const checks: ReadinessCheck[] = [
      { key: 'address', label: 'Domicilio tributario', status: pending(this.issuer.headOfficeAddress) || pending(this.issuer.establishmentAddress) ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'La dirección matriz y del establecimiento deben coincidir con el RUC.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'accounting', label: 'Contabilidad y régimen', status: this.issuer.accountingObligationConfirmed && !pending(this.issuer.regimeInformation) ? 'READY' : 'REQUIRES_CONFIRMATION', detail: 'La obligación contable y el régimen requieren confirmación institucional.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'establishment', label: 'Establecimiento', status: this.config.FISCAL_ESTABLISHMENT_CODE && !pending(this.issuer.establishmentAddress) ? 'READY' : 'REQUIRES_CONFIRMATION', detail: 'Código y dirección exacta deben estar confirmados.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'emissionPoint', label: 'Punto de emisión', status: this.config.FISCAL_EMISSION_POINT_CODE ? 'PARTIAL' : 'BLOCKED', detail: 'Código disponible; la numeración real continúa pendiente.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'sequence', label: 'Secuencial real', status: pending(this.config.FISCAL_SEQUENCE_START) ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'Debe verificarse en la fuente fiscal más reciente.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'catalog', label: 'Catálogo fiscal', status: catalog.some((item) => item.status !== 'VALIDATED') ? 'REQUIRES_CONFIRMATION' : 'READY', detail: 'Cada servicio requiere clasificación tributaria validada.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'certificate', label: 'Firma electrónica', status: this.config.FISCAL_CERT_PATH ? 'PARTIAL' : 'REQUIRES_CERTIFICATE', detail: 'Se requiere certificado vigente y secreto externo.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'sri', label: 'Adaptador SRI', status: 'REQUIRES_CERTIFICATION', detail: 'Permanece bloqueado hasta completar la certificación formal.', group: 'CERTIFICATION_REQUIRED' },
      { key: 'certificationTests', label: 'Pruebas de certificación', status: 'REQUIRES_CERTIFICATION', detail: 'Falta ejecutar y aprobar el conjunto institucional en certificación.', group: 'CERTIFICATION_REQUIRED' },

      { key: 'authentication', label: 'Autenticación y permisos', status: 'BLOCKED', detail: 'Pendiente integrar sesiones y roles institucionales.', group: 'PRODUCTION_REQUIRED' },
      { key: 'persistence', label: 'Persistencia fiscal segura', status: 'REQUIRES_CONFIRMATION', detail: this.config.FISCAL_STORAGE === 'postgres' ? 'Adaptador PostgreSQL activo; falta validar la operación institucional.' : 'Memoria temporal activa; adaptador PostgreSQL preparado y alternativa institucional por definir.', group: 'PRODUCTION_REQUIRED' },
      { key: 'storage', label: 'Almacenamiento privado XML/RIDE', status: 'BLOCKED', detail: 'Los archivos productivos requieren almacenamiento privado y controlado.', group: 'PRODUCTION_REQUIRED' },
      { key: 'backups', label: 'Respaldos', status: 'REQUIRES_CONFIRMATION', detail: 'Falta definir retención, restauración y pruebas de recuperación.', group: 'PRODUCTION_REQUIRED' },
      { key: 'audit', label: 'Auditoría', status: 'PARTIAL', detail: 'Existe trazabilidad funcional; falta persistencia institucional inmutable.', group: 'PRODUCTION_REQUIRED' },
      { key: 'mail', label: 'Correo de producción', status: 'BLOCKED', detail: 'Solo existen vista previa y envío simulado.', group: 'PRODUCTION_REQUIRED' },
      { key: 'recovery', label: 'Monitoreo y recuperación', status: 'REQUIRES_CONFIRMATION', detail: 'Faltan procedimientos operativos, alertas y recuperación documentada.', group: 'PRODUCTION_REQUIRED' },

      { key: 'postgres', label: 'PostgreSQL', status: this.config.FISCAL_STORAGE === 'postgres' ? 'PARTIAL' : 'REQUIRES_CONFIRMATION', detail: 'Recomendado por integridad y concurrencia; no es un requisito tributario.', group: 'RECOMMENDED_INFRASTRUCTURE' },
      { key: 'secretManager', label: 'Gestor de secretos', status: 'REQUIRES_CONFIRMATION', detail: 'Recomendado para certificado, contraseña y credenciales operativas.', group: 'RECOMMENDED_INFRASTRUCTURE' },
      { key: 'retryQueue', label: 'Cola de reintentos', status: 'PARTIAL', detail: 'La lógica existe; se recomienda una cola persistente para producción.', group: 'RECOMMENDED_INFRASTRUCTURE' },
      { key: 'metrics', label: 'Métricas y alertas', status: 'REQUIRES_CONFIRMATION', detail: 'Recomendadas para observar fallos y tiempos de respuesta.', group: 'RECOMMENDED_INFRASTRUCTURE' },
    ]
    const officialBlockers = checks.filter((item) => item.group !== 'RECOMMENDED_INFRASTRUCTURE' && item.status !== 'READY').map((item) => item.label)
    return { status: officialBlockers.length ? 'BLOCKED' : 'READY', ready: officialBlockers.length === 0, checks, officialBlockers }
  }
}
