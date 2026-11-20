-- =============================================================================
-- Abwab El Khair (أبواب الخير) — Primary Relational Schema for Neon PostgreSQL
-- =============================================================================
-- Primary structured database for all organizational, governance, RBAC,
-- beneficiary, pension, donation, treasury, financial, project, warehouse,
-- volunteer, activity, task, document metadata, and audit records.
--
-- Binary objects (attachments, images, logos, encrypted backup archives) are
-- stored exclusively in Cloudflare R2 (referenced via r2_object_key).
-- =============================================================================

CREATE TABLE IF NOT EXISTS abwab_users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('president', 'manager')),
  board_position TEXT NOT NULL DEFAULT 'مدير',
  membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'honorary')),
  assigned_activity_id TEXT,
  board_authorizations JSONB NOT NULL DEFAULT '{}'::jsonb,
  granular_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Database-level guarantee: strictly ONE President account can ever exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_abwab_single_president
  ON abwab_users ((1))
  WHERE role = 'president';

CREATE INDEX IF NOT EXISTS idx_abwab_users_email_lower ON abwab_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_abwab_users_username_lower ON abwab_users (LOWER(username));

CREATE TABLE IF NOT EXISTS abwab_activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_user_id TEXT REFERENCES abwab_users(id) ON DELETE SET NULL,
  manager_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'planned', 'completed')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_tasks (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  due_date TEXT,
  visible_to_board BOOLEAN NOT NULL DEFAULT TRUE,
  open_for_volunteers BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_volunteer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_families (
  id TEXT PRIMARY KEY,
  file_number TEXT NOT NULL UNIQUE,
  head_of_household TEXT NOT NULL,
  national_id_masked TEXT NOT NULL DEFAULT 'غير مسجل',
  national_id_encrypted TEXT,
  national_id_hash TEXT,
  has_national_id BOOLEAN NOT NULL DEFAULT FALSE,
  governorate TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  members_count INTEGER NOT NULL DEFAULT 1,
  marital_status TEXT NOT NULL DEFAULT 'married',
  economic_status TEXT NOT NULL DEFAULT 'low_income',
  income_source TEXT NOT NULL DEFAULT '',
  eligibility_status TEXT NOT NULL DEFAULT 'pending_review',
  approval_status TEXT NOT NULL DEFAULT 'pending_review',
  social_research_result TEXT NOT NULL DEFAULT '',
  social_research_date TIMESTAMPTZ,
  social_research_by_name TEXT,
  support_type TEXT NOT NULL DEFAULT 'monthly_pension',
  monthly_assistance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_assistance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  activity_id TEXT,
  activity_name TEXT,
  notes TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abwab_families_nid_hash ON abwab_families (national_id_hash) WHERE national_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abwab_families_eligibility ON abwab_families (eligibility_status, approval_status);

CREATE TABLE IF NOT EXISTS abwab_treasury_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash_vault', 'bank_account')),
  bank_name TEXT NOT NULL DEFAULT '',
  account_number_masked TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  fund_balances JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active',
  completion_percent INTEGER NOT NULL DEFAULT 0,
  beneficiary_family_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_report TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_pension_plans (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  family_name TEXT NOT NULL DEFAULT '',
  family_file_number TEXT NOT NULL DEFAULT '',
  monthly_amount NUMERIC(14, 2) NOT NULL,
  start_month_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  fund_type TEXT NOT NULL DEFAULT 'sadaqah',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_monthly_disbursements (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  family_name TEXT NOT NULL DEFAULT '',
  month_key TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'disbursed',
  proof_reference TEXT NOT NULL DEFAULT '',
  treasury_account_id TEXT,
  fund_type TEXT NOT NULL DEFAULT 'general',
  notes TEXT NOT NULL DEFAULT '',
  disbursed_by TEXT NOT NULL,
  disbursed_by_name TEXT NOT NULL DEFAULT '',
  disbursed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abwab_disbursements_family_month ON abwab_monthly_disbursements (family_id, month_key);

CREATE TABLE IF NOT EXISTS abwab_donations (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  donor_name TEXT NOT NULL DEFAULT '',
  donor_phone TEXT NOT NULL DEFAULT '',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  donation_date TEXT NOT NULL,
  month_key TEXT NOT NULL,
  treasury_account_id TEXT,
  treasury_account_name TEXT,
  project_id TEXT,
  project_name TEXT,
  activity_id TEXT,
  activity_name TEXT,
  in_kind_description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abwab_donations_date ON abwab_donations (donation_date DESC);

CREATE TABLE IF NOT EXISTS abwab_financial_transactions (
  id TEXT PRIMARY KEY,
  entry_number TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('expense', 'aid_disbursement', 'transfer')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL,
  tx_date TEXT NOT NULL,
  month_key TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  purpose_category TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  source_account_name TEXT NOT NULL DEFAULT '',
  destination_account_id TEXT,
  destination_account_name TEXT,
  project_id TEXT,
  project_name TEXT,
  family_id TEXT,
  family_name TEXT,
  workflow_status TEXT NOT NULL DEFAULT 'recorded',
  recorded_by TEXT NOT NULL,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT NOT NULL DEFAULT '',
  executed_by TEXT,
  executed_by_name TEXT,
  executed_at TIMESTAMPTZ,
  execution_reference TEXT NOT NULL DEFAULT '',
  reversed_by TEXT,
  reversed_by_name TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT NOT NULL DEFAULT '',
  reverses_transaction_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_abwab_fin_tx_date ON abwab_financial_transactions (tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_abwab_fin_tx_workflow ON abwab_financial_transactions (workflow_status);

CREATE TABLE IF NOT EXISTS abwab_warehouse_items (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'new',
  unit TEXT NOT NULL DEFAULT 'قطعة',
  current_qty INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER NOT NULL DEFAULT 3,
  received_date TEXT NOT NULL,
  donation_source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_warehouse_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL DEFAULT '',
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  movement_date TEXT NOT NULL,
  source_or_beneficiary TEXT NOT NULL DEFAULT '',
  beneficiary_family_id TEXT,
  beneficiary_family_name TEXT,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_volunteers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  team_name TEXT NOT NULL DEFAULT '',
  joined_at TEXT NOT NULL,
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
  evaluation_notes TEXT NOT NULL DEFAULT '',
  completed_tasks_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Metadata table only: actual binary files are stored in Cloudflare R2 (r2_object_key)
CREATE TABLE IF NOT EXISTS abwab_documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('family', 'project', 'organization')),
  entity_id TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_organization_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS abwab_password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS abwab_audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_code TEXT NOT NULL,
  summary_ar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abwab_audit_logs_created ON abwab_audit_logs (created_at DESC);

-- Catalog metadata for AES-256-GCM encrypted backups stored in Cloudflare R2
CREATE TABLE IF NOT EXISTS abwab_backup_registry (
  r2_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'system_cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

-- Atomic transactional state mirror (keeps sub-50ms Worker hydration in sync with relational tables)
CREATE TABLE IF NOT EXISTS abwab_state_sync (
  id TEXT PRIMARY KEY DEFAULT 'primary',
  version BIGINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
