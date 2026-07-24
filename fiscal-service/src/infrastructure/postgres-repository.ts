import pg from 'pg'
import type { FiscalRepository } from '../application/repository.js'
import type { DocumentType, FiscalDocument, FiscalEvent, SriTransmission } from '../domain/types.js'

const { Pool } = pg

export class PostgresFiscalRepository implements FiscalRepository {
  private readonly pool: pg.Pool
  private sequenceQueue: Promise<void> = Promise.resolve()
  constructor(connectionString: string, injectedPool?: pg.Pool) {
    this.pool = injectedPool ?? new Pool({ connectionString, max: 8, application_name: 'ra-training-fiscal-local' })
  }

  async close(): Promise<void> { await this.pool.end() }
  async check(): Promise<void> { await this.pool.query('SELECT 1') }

  async listDocuments(): Promise<FiscalDocument[]> {
    const result = await this.pool.query<{ payload: FiscalDocument }>('SELECT payload FROM fiscal_documents ORDER BY created_at DESC')
    return result.rows.map((row) => row.payload)
  }
  async getDocument(id: string): Promise<FiscalDocument | undefined> {
    const result = await this.pool.query<{ payload: FiscalDocument }>('SELECT payload FROM fiscal_documents WHERE id=$1', [id])
    return result.rows[0]?.payload
  }
  async findBySource(type: DocumentType, sourceId: string): Promise<FiscalDocument | undefined> {
    const result = await this.pool.query<{ payload: FiscalDocument }>(
      'SELECT payload FROM fiscal_documents WHERE document_type=$1 AND source_id=$2', [type, sourceId],
    )
    return result.rows[0]?.payload
  }
  async findByAccessKey(accessKey: string): Promise<FiscalDocument | undefined> {
    const result = await this.pool.query<{ payload: FiscalDocument }>('SELECT payload FROM fiscal_documents WHERE access_key=$1', [accessKey])
    return result.rows[0]?.payload
  }

  async saveDocument(document: FiscalDocument): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const customer = document.customer
      await client.query(`
        INSERT INTO fiscal_customers (id,identification_type,identification,legal_name,address,email,phone,source_participant_id,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET legal_name=EXCLUDED.legal_name,address=EXCLUDED.address,email=EXCLUDED.email,phone=EXCLUDED.phone,updated_at=EXCLUDED.updated_at`,
      [customer.id, customer.identificationType, customer.identification, customer.legalName, customer.address, customer.email,
        customer.phone ?? null, customer.sourceParticipantId ?? null, customer.createdAt, customer.updatedAt])
      await client.query(`
        INSERT INTO fiscal_documents (id,document_type,source_type,source_id,issuer_id,customer_id,environment,issue_date,establishment_code,
          emission_point_code,sequential,access_key,currency,status,subtotal,total_discount,total_without_taxes,total_taxes,grand_total,payment_status,
          xml_unsigned_path,xml_signed_path,authorized_xml_path,ride_path,authorization_number,authorization_date,sri_status,sri_message,created_by,created_at,updated_at,payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,sequential=EXCLUDED.sequential,access_key=EXCLUDED.access_key,
          subtotal=EXCLUDED.subtotal,total_discount=EXCLUDED.total_discount,total_without_taxes=EXCLUDED.total_without_taxes,
          total_taxes=EXCLUDED.total_taxes,grand_total=EXCLUDED.grand_total,xml_unsigned_path=EXCLUDED.xml_unsigned_path,
          xml_signed_path=EXCLUDED.xml_signed_path,authorized_xml_path=EXCLUDED.authorized_xml_path,ride_path=EXCLUDED.ride_path,
          authorization_number=EXCLUDED.authorization_number,authorization_date=EXCLUDED.authorization_date,sri_status=EXCLUDED.sri_status,
          sri_message=EXCLUDED.sri_message,updated_at=EXCLUDED.updated_at,payload=EXCLUDED.payload`,
      [document.id, document.documentType, document.sourceType, document.sourceId, document.issuerId, customer.id, document.environment,
        document.issueDate, document.establishmentCode, document.emissionPointCode, document.sequential ?? null, document.accessKey ?? null,
        document.currency, document.status, document.subtotal, document.totalDiscount, document.totalWithoutTaxes, document.totalTaxes,
        document.grandTotal, document.paymentStatus, document.xmlUnsignedPath ?? null, document.xmlSignedPath ?? null,
        document.authorizedXmlPath ?? null, document.ridePath ?? null, document.authorizationNumber ?? null,
        document.authorizationDate ?? null, document.sriStatus ?? null, document.sriMessage ?? null, document.createdBy,
        document.createdAt, document.updatedAt, JSON.stringify(document)])
      for (const item of document.items) {
        await client.query(`INSERT INTO fiscal_document_items (id,document_id,main_code,auxiliary_code,description,quantity,unit_price,discount,subtotal,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description,quantity=EXCLUDED.quantity,
          unit_price=EXCLUDED.unit_price,discount=EXCLUDED.discount,subtotal=EXCLUDED.subtotal`,
        [item.id, item.documentId, item.mainCode, item.auxiliaryCode ?? null, item.description, item.quantity, item.unitPrice, item.discount, item.subtotal, item.createdAt])
      }
      for (const tax of document.taxes) {
        await client.query(`INSERT INTO fiscal_tax_lines (id,document_id,item_id,tax_code,percentage_code,rate,taxable_base,tax_value)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET rate=EXCLUDED.rate,taxable_base=EXCLUDED.taxable_base,tax_value=EXCLUDED.tax_value`,
        [tax.id, tax.documentId, tax.itemId ?? null, tax.taxCode, tax.percentageCode, tax.rate, tax.taxableBase, tax.taxValue])
      }
      for (const payment of document.payments) {
        await client.query(`INSERT INTO fiscal_payment_methods (id,document_id,method_code,amount,term,time_unit) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET method_code=EXCLUDED.method_code,amount=EXCLUDED.amount,term=EXCLUDED.term,time_unit=EXCLUDED.time_unit`,
        [payment.id, payment.documentId, payment.methodCode, payment.amount, payment.term ?? null, payment.timeUnit ?? null])
      }
      if (document.creditNoteReference) {
        const ref = document.creditNoteReference
        await client.query(`INSERT INTO credit_note_references (id,credit_note_document_id,original_invoice_id,original_document_number,original_issue_date,reason,modified_value)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (credit_note_document_id) DO NOTHING`,
        [ref.id, ref.creditNoteDocumentId, ref.originalInvoiceId, ref.originalDocumentNumber, ref.originalIssueDate, ref.reason, ref.modifiedValue])
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async reserveSequential(type: DocumentType, establishment: string, point: string): Promise<string> {
    let release: () => void = () => undefined
    const previous = this.sequenceQueue
    this.sequenceQueue = new Promise<void>((resolve) => { release = resolve })
    await previous
    try { return await this.reserveSequentialTransaction(type, establishment, point) }
    finally { release() }
  }

  private async reserveSequentialTransaction(type: DocumentType, establishment: string, point: string): Promise<string> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`INSERT INTO fiscal_sequences (document_type,establishment_code,emission_point_code,current_value)
        VALUES ($1,$2,$3,0) ON CONFLICT (document_type,establishment_code,emission_point_code) DO NOTHING`, [type, establishment, point])
      const current = await client.query<{ current_value: string }>(`SELECT current_value FROM fiscal_sequences
        WHERE document_type=$1 AND establishment_code=$2 AND emission_point_code=$3 FOR UPDATE`, [type, establishment, point])
      const next = Number(current.rows[0]?.current_value ?? 0) + 1
      if (next > 999_999_999) throw new Error('Secuencial agotado')
      await client.query(`UPDATE fiscal_sequences SET current_value=$4,version=version+1,updated_at=now()
        WHERE document_type=$1 AND establishment_code=$2 AND emission_point_code=$3`, [type, establishment, point, next])
      await client.query('COMMIT')
      return String(next).padStart(9, '0')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async addEvent(event: FiscalEvent): Promise<void> {
    await this.pool.query(`INSERT INTO fiscal_events (id,document_id,event_type,previous_status,new_status,actor,details_json,occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [event.id, event.documentId, event.eventType, event.previousStatus ?? null,
      event.newStatus ?? null, event.actor, JSON.stringify(event.detailsJson), event.occurredAt])
  }
  async listEvents(documentId: string): Promise<FiscalEvent[]> {
    const result = await this.pool.query('SELECT id,document_id AS "documentId",event_type AS "eventType",previous_status AS "previousStatus",new_status AS "newStatus",actor,details_json AS "detailsJson",occurred_at AS "occurredAt" FROM fiscal_events WHERE document_id=$1 ORDER BY occurred_at', [documentId])
    return result.rows as FiscalEvent[]
  }
  async addTransmission(item: SriTransmission): Promise<void> {
    await this.pool.query(`INSERT INTO sri_transmissions (id,document_id,phase,attempt,request_hash,response_code,response_status,response_message,raw_request_path,raw_response_path,started_at,completed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (document_id,phase,attempt) DO NOTHING`,
    [item.id,item.documentId,item.phase,item.attempt,item.requestHash,item.responseCode,item.responseStatus,item.responseMessage,
      item.rawRequestPath ?? null,item.rawResponsePath ?? null,item.startedAt,item.completedAt])
  }
  async listTransmissions(documentId: string): Promise<SriTransmission[]> {
    const result = await this.pool.query('SELECT id,document_id AS "documentId",phase,attempt,request_hash AS "requestHash",response_code AS "responseCode",response_status AS "responseStatus",response_message AS "responseMessage",raw_request_path AS "rawRequestPath",raw_response_path AS "rawResponsePath",started_at AS "startedAt",completed_at AS "completedAt" FROM sri_transmissions WHERE document_id=$1 ORDER BY started_at', [documentId])
    return result.rows as SriTransmission[]
  }
  async rememberIdempotency(key: string, resourceId: string): Promise<void> {
    await this.pool.query('INSERT INTO fiscal_idempotency (idempotency_key,resource_id) VALUES ($1,$2) ON CONFLICT (idempotency_key) DO NOTHING', [key, resourceId])
  }
  async resolveIdempotency(key: string): Promise<string | undefined> {
    const result = await this.pool.query<{ resource_id: string }>('SELECT resource_id FROM fiscal_idempotency WHERE idempotency_key=$1', [key])
    return result.rows[0]?.resource_id
  }
}
