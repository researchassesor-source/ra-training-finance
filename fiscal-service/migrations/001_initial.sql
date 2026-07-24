BEGIN;

CREATE TABLE IF NOT EXISTS issuer_configs (
  id text PRIMARY KEY,
  ruc_placeholder varchar(13) NOT NULL,
  business_name varchar(300) NOT NULL,
  trade_name varchar(300) NOT NULL,
  head_office_address varchar(300) NOT NULL,
  accounting_obligation varchar(2) NOT NULL CHECK (accounting_obligation IN ('SI','NO')),
  special_taxpayer_code varchar(13),
  regime_information varchar(80),
  environment char(1) NOT NULL CHECK (environment IN ('1','2')),
  currency varchar(8) NOT NULL DEFAULT 'DOLAR',
  timezone varchar(64) NOT NULL DEFAULT 'America/Guayaquil',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS establishments (
  id text PRIMARY KEY,
  issuer_id text NOT NULL REFERENCES issuer_configs(id),
  code char(3) NOT NULL,
  address varchar(300) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (issuer_id, code)
);

CREATE TABLE IF NOT EXISTS emission_points (
  id text PRIMARY KEY,
  establishment_id text NOT NULL REFERENCES establishments(id),
  code char(3) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (establishment_id, code)
);

CREATE TABLE IF NOT EXISTS fiscal_sequences (
  id bigserial PRIMARY KEY,
  document_type varchar(20) NOT NULL,
  establishment_code char(3) NOT NULL,
  emission_point_code char(3) NOT NULL,
  current_value bigint NOT NULL DEFAULT 0 CHECK (current_value BETWEEN 0 AND 999999999),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, establishment_code, emission_point_code)
);

CREATE TABLE IF NOT EXISTS fiscal_customers (
  id text PRIMARY KEY,
  identification_type char(2) NOT NULL,
  identification varchar(20) NOT NULL,
  legal_name varchar(300) NOT NULL,
  address varchar(300) NOT NULL,
  email varchar(320) NOT NULL,
  phone varchar(30),
  source_participant_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_documents (
  id text PRIMARY KEY,
  document_type varchar(20) NOT NULL,
  source_type varchar(40) NOT NULL,
  source_id text NOT NULL,
  issuer_id text NOT NULL REFERENCES issuer_configs(id),
  customer_id text NOT NULL REFERENCES fiscal_customers(id),
  environment char(1) NOT NULL,
  issue_date date NOT NULL,
  establishment_code char(3) NOT NULL,
  emission_point_code char(3) NOT NULL,
  sequential char(9),
  access_key char(49),
  currency varchar(8) NOT NULL,
  status varchar(40) NOT NULL,
  subtotal numeric(18,2) NOT NULL,
  total_discount numeric(18,2) NOT NULL,
  total_without_taxes numeric(18,2) NOT NULL,
  total_taxes numeric(18,2) NOT NULL,
  grand_total numeric(18,2) NOT NULL,
  payment_status varchar(30) NOT NULL,
  xml_unsigned_path text,
  xml_signed_path text,
  authorized_xml_path text,
  ride_path text,
  authorization_number text,
  authorization_date timestamptz,
  sri_status varchar(60),
  sri_message text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (document_type, source_id),
  UNIQUE (access_key),
  UNIQUE (document_type, establishment_code, emission_point_code, sequential)
);

CREATE TABLE IF NOT EXISTS fiscal_document_items (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES fiscal_documents(id),
  main_code varchar(25) NOT NULL,
  auxiliary_code varchar(25),
  description varchar(300) NOT NULL,
  quantity numeric(24,6) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24,6) NOT NULL CHECK (unit_price >= 0),
  discount numeric(18,2) NOT NULL CHECK (discount >= 0),
  subtotal numeric(18,2) NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_tax_lines (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES fiscal_documents(id),
  item_id text REFERENCES fiscal_document_items(id),
  tax_code varchar(4) NOT NULL,
  percentage_code varchar(4) NOT NULL,
  rate numeric(8,2) NOT NULL,
  taxable_base numeric(18,2) NOT NULL,
  tax_value numeric(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_payment_methods (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES fiscal_documents(id),
  method_code varchar(4) NOT NULL,
  amount numeric(18,2) NOT NULL,
  term integer,
  time_unit varchar(30)
);

CREATE TABLE IF NOT EXISTS credit_note_references (
  id text PRIMARY KEY,
  credit_note_document_id text NOT NULL UNIQUE REFERENCES fiscal_documents(id),
  original_invoice_id text NOT NULL REFERENCES fiscal_documents(id),
  original_document_number varchar(17) NOT NULL,
  original_issue_date date NOT NULL,
  reason varchar(300) NOT NULL,
  modified_value numeric(18,2) NOT NULL,
  UNIQUE (original_invoice_id, reason, modified_value)
);

CREATE TABLE IF NOT EXISTS sri_transmissions (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES fiscal_documents(id),
  phase varchar(30) NOT NULL,
  attempt integer NOT NULL,
  request_hash char(64) NOT NULL,
  response_code varchar(80) NOT NULL,
  response_status varchar(80) NOT NULL,
  response_message text NOT NULL,
  raw_request_path text,
  raw_response_path text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  UNIQUE (document_id, phase, attempt)
);

CREATE TABLE IF NOT EXISTS fiscal_events (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES fiscal_documents(id),
  event_type varchar(80) NOT NULL,
  previous_status varchar(40),
  new_status varchar(40),
  actor text NOT NULL,
  details_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate_metadata (
  id text PRIMARY KEY,
  issuer_id text NOT NULL REFERENCES issuer_configs(id),
  alias varchar(120) NOT NULL,
  fingerprint varchar(128) NOT NULL,
  subject text NOT NULL,
  issuer text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  key_reference text NOT NULL,
  status varchar(30) NOT NULL,
  CHECK (key_reference NOT LIKE '%BEGIN PRIVATE KEY%')
);

CREATE TABLE IF NOT EXISTS fiscal_idempotency (
  idempotency_key varchar(128) PRIMARY KEY,
  resource_id text NOT NULL REFERENCES fiscal_documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
