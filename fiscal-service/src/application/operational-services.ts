export type FiscalCatalogStatus = 'VALIDATED' | 'REQUIRES_TAX_REVIEW'

export interface OperationalService {
  operationalId: string
  operationalName: string
  operationalDescription: string
  referencePrice: string
}

export interface FiscalCatalogItem extends OperationalService {
  mainCode: string
  auxiliaryCode?: string
  invoiceDescription: string
  priceIncludesTax: boolean
  taxCode?: string
  percentageCode?: string
  rate?: string
  exempt: boolean
  notSubject: boolean
  fiscalCategory?: string
  activeForBilling: boolean
  status: FiscalCatalogStatus
  validatedAt?: string
  validatedBy?: string
}

export interface OperationalServicesProvider {
  readonly kind: 'MOCK' | 'EXISTING_APPLICATION' | 'FUTURE_SERVER_SIDE'
  list(): Promise<OperationalService[]>
}

export class MockOperationalServicesProvider implements OperationalServicesProvider {
  readonly kind = 'MOCK' as const
  async list(): Promise<OperationalService[]> {
    return [
      { operationalId: 'SVC-FAKE-001', operationalName: 'Curso ficticio de análisis', operationalDescription: 'Servicio exclusivo de demostración local', referencePrice: '100.00' },
      { operationalId: 'SVC-FAKE-002', operationalName: 'Taller ficticio digital', operationalDescription: 'Servicio pendiente de clasificación tributaria', referencePrice: '80.00' },
      { operationalId: 'SVC-FAKE-003', operationalName: 'Programa ficticio institucional', operationalDescription: 'Ejemplo para importar varias líneas', referencePrice: '200.00' },
    ]
  }
}

export class ExistingApplicationServicesProvider implements OperationalServicesProvider {
  readonly kind = 'EXISTING_APPLICATION' as const
  constructor(private readonly enabled: boolean, private readonly loader: () => Promise<OperationalService[]>) {}
  async list(): Promise<OperationalService[]> {
    if (!this.enabled) throw new Error('VITE_FISCAL_USE_EXISTING_APP_DATA=false: integración operativa bloqueada')
    return this.loader()
  }
}

export class FutureServerSideServicesProvider implements OperationalServicesProvider {
  readonly kind = 'FUTURE_SERVER_SIDE' as const
  async list(): Promise<OperationalService[]> {
    throw new Error('Proveedor server-side futuro sin credenciales ni conexión configurada')
  }
}

export class FiscalCatalogService {
  constructor(private readonly provider: OperationalServicesProvider = new MockOperationalServicesProvider()) {}
  async list(): Promise<FiscalCatalogItem[]> {
    const services = await this.provider.list()
    return services.map((service, index) => ({
      ...service,
      mainCode: `FISC-DEMO-${String(index + 1).padStart(2, '0')}`,
      invoiceDescription: service.operationalDescription,
      priceIncludesTax: false,
      exempt: false,
      notSubject: false,
      activeForBilling: false,
      status: 'REQUIRES_TAX_REVIEW',
    }))
  }
}
