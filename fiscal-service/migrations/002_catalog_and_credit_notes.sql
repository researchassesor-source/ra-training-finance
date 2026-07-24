BEGIN;

ALTER TABLE fiscal_documents DROP CONSTRAINT IF EXISTS fiscal_documents_document_type_source_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_invoice_source ON fiscal_documents (source_id) WHERE document_type = 'INVOICE';
CREATE INDEX IF NOT EXISTS ix_fiscal_credit_note_source ON fiscal_documents (source_id) WHERE document_type = 'CREDIT_NOTE';

CREATE TABLE IF NOT EXISTS fiscal_catalog_items (
  operational_id text PRIMARY KEY,
  main_code varchar(25) NOT NULL UNIQUE,
  auxiliary_code varchar(25),
  operational_name varchar(300) NOT NULL,
  invoice_description varchar(300) NOT NULL,
  reference_price numeric(18,2) NOT NULL CHECK (reference_price >= 0),
  price_includes_tax boolean NOT NULL DEFAULT false,
  tax_code varchar(4),
  percentage_code varchar(4),
  rate numeric(8,2),
  exempt boolean NOT NULL DEFAULT false,
  not_subject boolean NOT NULL DEFAULT false,
  fiscal_category varchar(60),
  active_for_billing boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'REQUIRES_TAX_REVIEW',
  validated_at timestamptz,
  validated_by text,
  CHECK (status IN ('VALIDATED','REQUIRES_TAX_REVIEW')),
  CHECK (status <> 'VALIDATED' OR (tax_code IS NOT NULL AND percentage_code IS NOT NULL AND rate IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS sequence_initializations (
  id bigserial PRIMARY KEY,
  establishment_code char(3) NOT NULL,
  emission_point_code char(3) NOT NULL,
  last_used bigint NOT NULL CHECK (last_used BETWEEN 0 AND 999999998),
  next_value bigint NOT NULL CHECK (next_value BETWEEN 1 AND 999999999),
  verification_source text NOT NULL,
  verified_at timestamptz NOT NULL,
  responsible text NOT NULL,
  double_confirmed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_code, emission_point_code),
  CHECK (next_value = last_used + 1),
  CHECK (double_confirmed = true)
);

COMMIT;
