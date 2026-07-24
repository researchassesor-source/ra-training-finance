import type { Establishment, EmissionPoint, IssuerConfig, MockEnrollment } from '../domain/types.js'

const now = '2026-07-23T09:00:00.000-05:00'

export const fakeIssuer: IssuerConfig = {
  id: 'ISSUER-LOCAL-FAKE',
  rucPlaceholder: '9999999999001',
  businessName: 'EMPRESA FICTICIA DE CAPACITACIÓN S.A.S.',
  tradeName: 'AULA DEMO LOCAL',
  headOfficeAddress: 'AV. FICTICIA 123 Y CALLE DEMOSTRACIÓN, ECUADOR',
  establishmentAddress: 'AV. FICTICIA 123 Y CALLE DEMOSTRACIÓN',
  city: 'Ciudad Demo',
  phone: '0990000000',
  email: 'fiscal@example.test',
  accountingObligation: 'NO',
  accountingObligationConfirmed: true,
  retentionAgent: 'NO',
  regimeInformation: 'PERFIL FICTICIO PARA PRUEBAS',
  establishmentCode: '001',
  emissionPointCode: '001',
  environment: '1',
  currency: 'DOLAR',
  timezone: 'America/Guayaquil',
  createdAt: now,
  updatedAt: now,
}

export const fakeEstablishment: Establishment = {
  id: 'EST-LOCAL-FAKE',
  issuerId: fakeIssuer.id,
  code: '001',
  address: 'AV. FICTICIA 123 Y CALLE DEMOSTRACIÓN',
  active: true,
}

export const fakeEmissionPoint: EmissionPoint = {
  id: 'PTO-LOCAL-FAKE',
  establishmentId: fakeEstablishment.id,
  code: '001',
  active: true,
}

export const fakeEnrollments: MockEnrollment[] = [
  {
    id: 'ENR-FAKE-001', participantName: 'Valeria Prueba Andina', participantIdentification: '0999999999',
    participantEmail: 'valeria.prueba@example.test', participantAddress: 'Calle Ficticia 100, Ciudad Demo',
    participantPhone: '0990000001', serviceName: 'Curso demostrativo de análisis de datos', serviceCode: 'CUR-DEMO-01',
    amount: '115.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ELIGIBLE', issueNote: 'Caso completo con pago verificado.',
  },
  {
    id: 'ENR-FAKE-002', participantName: 'Mateo Ensayo Sierra', participantIdentification: '0999999998',
    participantEmail: 'mateo.ensayo@example.test', participantAddress: 'Pasaje Simulado 22, Ciudad Demo',
    participantPhone: '0990000002', serviceName: 'Taller ficticio de herramientas digitales', serviceCode: 'TAL-DEMO-02',
    amount: '80.00', paymentStatus: 'PENDING', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: pago pendiente.',
  },
  {
    id: 'ENR-FAKE-003', participantName: 'Camila Escenario Costa', participantIdentification: '0999999997',
    participantEmail: 'correo-invalido', participantAddress: 'Avenida Ejemplo 3, Ciudad Demo',
    participantPhone: '0990000003', serviceName: 'Seminario local ficticio', serviceCode: 'SEM-DEMO-03',
    amount: '50.00', paymentStatus: 'VERIFIED', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: correo inválido.',
  },
  {
    id: 'ENR-FAKE-004', participantName: 'Bruno Caso Oriente', participantIdentification: '',
    participantEmail: 'bruno.caso@example.test', participantAddress: 'Ruta Imaginaria 45, Ciudad Demo',
    participantPhone: '0990000004', serviceName: 'Curso ficticio de investigación', serviceCode: 'CUR-DEMO-04',
    amount: '95.00', paymentStatus: 'VERIFIED', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: identificación incompleta.',
  },
  {
    id: 'ENR-FAKE-005', participantName: 'Lucía Muestra Austral', participantIdentification: '0999999996',
    participantEmail: 'lucia.muestra@example.test', participantAddress: 'Calle Laboratorio 5, Ciudad Demo',
    participantPhone: '0990000005', serviceName: 'Programa ficticio ya facturado', serviceCode: 'PRO-DEMO-05',
    amount: '120.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ALREADY_INVOICED', issueNote: 'Caso reservado para probar duplicados.',
  },
  {
    id: 'ENR-FAKE-006', participantName: 'Nicolás Ejemplo Central', participantIdentification: '0999999995',
    participantEmail: 'nicolas.ejemplo@example.test', participantAddress: 'Boulevard Prueba 6, Ciudad Demo',
    participantPhone: '0990000006', serviceName: 'Curso candidato a nota de crédito', serviceCode: 'CUR-DEMO-06',
    amount: '230.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ELIGIBLE', issueNote: 'Caso completo para factura y nota de crédito.',
  },
]

export interface BillingSourceProvider {
  list(): Promise<MockEnrollment[]>
  get(id: string): Promise<MockEnrollment | undefined>
}

export class MockBillingSourceProvider implements BillingSourceProvider {
  async list(): Promise<MockEnrollment[]> { return structuredClone(fakeEnrollments) }
  async get(id: string): Promise<MockEnrollment | undefined> {
    const found = fakeEnrollments.find((item) => item.id === id)
    return found ? structuredClone(found) : undefined
  }
}

export class FutureAppsScriptBillingSourceProvider implements BillingSourceProvider {
  async list(): Promise<MockEnrollment[]> {
    throw new Error('Adaptador Apps Script deshabilitado: esta fase no permite conexiones externas')
  }
  async get(_id: string): Promise<MockEnrollment | undefined> {
    throw new Error('Adaptador Apps Script deshabilitado: esta fase no permite conexiones externas')
  }
}
