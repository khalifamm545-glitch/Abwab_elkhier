import {neon} from '@neondatabase/serverless';
import type {AuthDatabaseState} from './authStore.ts';

export type PersistentStorageMode = 'neon_postgres' | 'local_disk';

export interface NeonParityReport {
  matched: boolean;
  localCounts: Record<string, number>;
  neonCounts: Record<string, number>;
  treasuryLocalTotal: string;
  treasuryNeonTotal: string;
  usersHashParity: boolean;
  familiesNationalIdParity: boolean;
  mismatches: string[];
}

let runtimeDatabaseUrl: string | null = null;
let schemaInitializedForUrl: string | null = null;

export function setRuntimeDatabaseUrl(url: string | undefined): void {
  const clean = (url || '').trim();
  runtimeDatabaseUrl = clean.length > 0 ? clean : null;
}

export function getActiveDatabaseUrl(): string | null {
  if (runtimeDatabaseUrl) return runtimeDatabaseUrl;
  const fromEnv =
    typeof process !== 'undefined' && process.env ? (process.env.DATABASE_URL || '').trim() : '';
  return fromEnv.length > 0 ? fromEnv : null;
}

export function getNeonStorageMode(): PersistentStorageMode {
  return getActiveDatabaseUrl() ? 'neon_postgres' : 'local_disk';
}

const NEON_CORE_DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS abwab_users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('president', 'manager')),
    board_position TEXT NOT NULL DEFAULT 'مدير',
    membership_status TEXT NOT NULL DEFAULT 'active',
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_abwab_single_president ON abwab_users ((1)) WHERE role = 'president'`,
  `CREATE TABLE IF NOT EXISTS abwab_families (
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
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_treasury_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    bank_name TEXT NOT NULL DEFAULT '',
    account_number_masked TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    fund_balances JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_donations (
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
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_financial_transactions (
    id TEXT PRIMARY KEY,
    entry_number TEXT NOT NULL UNIQUE,
    tx_type TEXT NOT NULL,
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
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_documents (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    r2_object_key TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_by_name TEXT NOT NULL DEFAULT '',
    uploaded_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_backup_registry (
    r2_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT NOT NULL DEFAULT 'system_cron',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_code TEXT NOT NULL,
    summary_ar TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS abwab_state_sync (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    version BIGINT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

export async function ensureNeonSchema(databaseUrl?: string): Promise<void> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) return;
  if (schemaInitializedForUrl === url) return;

  const sql = neon(url);
  for (const ddl of NEON_CORE_DDL_STATEMENTS) {
    await sql.query(ddl);
  }
  schemaInitializedForUrl = url;
}

export async function loadStateFromNeon(
  databaseUrl?: string,
): Promise<Partial<AuthDatabaseState> | null> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) return null;

  await ensureNeonSchema(url);
  const sql = neon(url);
  const rows = (await sql.query(
    `SELECT payload FROM abwab_state_sync WHERE id = 'primary' LIMIT 1`,
  )) as Array<{payload?: Partial<AuthDatabaseState>}>;

  if (Array.isArray(rows) && rows.length > 0 && rows[0]?.payload) {
    return rows[0].payload;
  }
  return null;
}

/**
 * Atomically saves the structured application state to Neon PostgreSQL:
 *  - Updates `abwab_state_sync` (versioned transactional snapshot)
 *  - Syncs core normalized relational tables (users, families, treasury, donations,
 *    financial transactions, documents metadata, audit logs) inside a single transaction
 *    so SQL reporting, constraints (single president), and integrity checks stay 100% live.
 */
export async function saveStateToNeon(
  state: AuthDatabaseState,
  databaseUrl?: string,
): Promise<void> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) return;

  await ensureNeonSchema(url);
  const sql = neon(url);

  const queries = [
    sql.query(
      `INSERT INTO abwab_state_sync (id, version, payload, updated_at)
       VALUES ('primary', 1, $1::jsonb, NOW())
       ON CONFLICT (id)
       DO UPDATE SET version = abwab_state_sync.version + 1, payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(state)],
    ),
    sql.query(`DELETE FROM abwab_users`),
    sql.query(`DELETE FROM abwab_families`),
    sql.query(`DELETE FROM abwab_treasury_accounts`),
    sql.query(`DELETE FROM abwab_donations`),
    sql.query(`DELETE FROM abwab_financial_transactions`),
    sql.query(`DELETE FROM abwab_documents`),
    sql.query(`DELETE FROM abwab_audit_logs`),
  ];

  for (const u of state.users) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_users (
          id, full_name, username, email, phone, role, board_position, membership_status,
          assigned_activity_id, board_authorizations, granular_permissions, module_permissions,
          is_active, must_change_password, password_hash, token_version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10::jsonb, $11::jsonb, $12::jsonb,
          $13, $14, $15, $16, $17::timestamptz, $18::timestamptz
        )`,
        [
          u.id,
          u.fullName,
          u.username,
          u.email,
          u.phone || '',
          u.role,
          u.boardPosition || (u.role === 'president' ? 'رئيس مجلس الإدارة' : 'مدير'),
          u.membershipStatus || 'active',
          u.assignedActivityId,
          JSON.stringify(u.boardAuthorizations || {}),
          JSON.stringify(u.granularPermissions || {}),
          JSON.stringify(u.modulePermissions || {}),
          Boolean(u.isActive),
          Boolean(u.mustChangePassword),
          u.passwordHash,
          u.tokenVersion ?? 1,
          u.createdAt,
          u.updatedAt,
        ],
      ),
    );
  }

  for (const f of state.families) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_families (
          id, file_number, head_of_household, national_id_masked, national_id_encrypted,
          national_id_hash, has_national_id, governorate, address, phone, members_count,
          marital_status, economic_status, income_source, eligibility_status, approval_status,
          social_research_result, social_research_date, social_research_by_name, support_type,
          monthly_assistance_enabled, monthly_assistance_amount, activity_id, activity_name,
          notes, attachments, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18::timestamptz, $19, $20,
          $21, $22::numeric, $23, $24,
          $25, $26::jsonb, $27, $28::timestamptz, $29::timestamptz
        )`,
        [
          f.id,
          f.fileNumber,
          f.headOfHousehold,
          f.nationalIdMasked || 'غير مسجل',
          f.nationalIdEncrypted || null,
          f.nationalIdHash || null,
          Boolean(f.hasNationalId),
          f.governorate,
          f.address || '',
          f.phone,
          f.membersCount,
          f.maritalStatus || 'married',
          f.economicStatus || 'low_income',
          f.incomeSource || '',
          f.eligibilityStatus,
          f.approvalStatus || 'pending_review',
          f.socialResearchResult || '',
          f.socialResearchDate || null,
          f.socialResearchByName || null,
          f.supportType,
          Boolean(f.monthlyAssistanceEnabled),
          f.monthlyAssistanceAmount || '0.00',
          f.activityId || null,
          f.activityName || null,
          f.notes || '',
          JSON.stringify(f.attachments || []),
          f.createdBy,
          f.createdAt,
          f.updatedAt,
        ],
      ),
    );
  }

  for (const acc of state.treasuryAccounts) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_treasury_accounts (
          id, name, account_type, bank_name, account_number_masked,
          is_active, current_balance, fund_balances, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::jsonb, $9::timestamptz, $10::timestamptz)`,
        [
          acc.id,
          acc.name,
          acc.accountType,
          acc.bankName || '',
          acc.accountNumberMasked || '',
          Boolean(acc.isActive),
          acc.currentBalance || '0.00',
          JSON.stringify(acc.fundBalances || {}),
          acc.createdAt,
          acc.updatedAt,
        ],
      ),
    );
  }

  for (const d of state.donations) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_donations (
          id, receipt_number, donor_name, donor_phone, is_anonymous, category, fund_type,
          payment_method, amount, donation_date, month_key, treasury_account_id,
          treasury_account_name, project_id, project_name, activity_id, activity_name,
          in_kind_description, notes, recorded_by, recorded_by_name, recorded_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9::numeric, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22::timestamptz
        )`,
        [
          d.id,
          d.receiptNumber,
          d.donorName || '',
          d.donorPhone || '',
          Boolean(d.isAnonymous),
          d.category,
          d.fundType,
          d.paymentMethod || 'cash',
          d.amount || '0.00',
          d.donationDate,
          d.monthKey,
          d.treasuryAccountId || null,
          d.treasuryAccountName || null,
          d.projectId || null,
          d.projectName || null,
          d.activityId || null,
          d.activityName || null,
          d.inKindDescription || '',
          d.notes || '',
          d.recordedBy,
          d.recordedByName || '',
          d.recordedAt,
        ],
      ),
    );
  }

  for (const tx of state.financialTransactions) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_financial_transactions (
          id, entry_number, tx_type, title, description, amount, tx_date, month_key,
          fund_type, purpose_category, source_account_id, source_account_name,
          destination_account_id, destination_account_name, project_id, project_name,
          family_id, family_name, workflow_status, recorded_by, recorded_by_name,
          recorded_at, approved_by, approved_by_name, approved_at, approval_notes,
          executed_by, executed_by_name, executed_at, execution_reference,
          reversed_by, reversed_by_name, reversed_at, reversal_reason, reverses_transaction_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6::numeric, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22::timestamptz, $23, $24, $25::timestamptz, $26,
          $27, $28, $29::timestamptz, $30,
          $31, $32, $33::timestamptz, $34, $35
        )`,
        [
          tx.id,
          tx.entryNumber,
          tx.txType,
          tx.title,
          tx.description || '',
          tx.amount || '0.00',
          tx.txDate,
          tx.monthKey,
          tx.fundType,
          tx.purposeCategory,
          tx.sourceAccountId,
          tx.sourceAccountName || '',
          tx.destinationAccountId || null,
          tx.destinationAccountName || null,
          tx.projectId || null,
          tx.projectName || null,
          tx.familyId || null,
          tx.familyName || null,
          tx.workflowStatus,
          tx.recordedBy,
          tx.recordedByName || '',
          tx.recordedAt,
          tx.approvedBy || null,
          tx.approvedByName || null,
          tx.approvedAt || null,
          tx.approvalNotes || '',
          tx.executedBy || null,
          tx.executedByName || null,
          tx.executedAt || null,
          tx.executionReference || '',
          tx.reversedBy || null,
          tx.reversedByName || null,
          tx.reversedAt || null,
          tx.reversalReason || '',
          tx.reversesTransactionId || null,
        ],
      ),
    );
  }

  for (const doc of state.documents) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_documents (
          id, file_name, mime_type, size_bytes, entity_type, entity_id,
          r2_object_key, uploaded_by, uploaded_by_name, uploaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
        [
          doc.id,
          doc.fileName,
          doc.mimeType,
          doc.sizeBytes,
          doc.entityType,
          doc.entityId,
          doc.r2ObjectKey || `documents/${doc.entityType}/${doc.entityId}/${doc.diskFileName}`,
          doc.uploadedBy,
          doc.uploadedByName || '',
          doc.uploadedAt,
        ],
      ),
    );
  }

  for (const log of state.auditLogs.slice(0, 500)) {
    queries.push(
      sql.query(
        `INSERT INTO abwab_audit_logs (
          id, actor_user_id, actor_name, actor_role, action_code, summary_ar, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
        [
          log.id,
          log.actorUserId || null,
          log.actorName,
          log.actorRole,
          log.actionCode,
          log.summaryAr,
          log.createdAt,
        ],
      ),
    );
  }

  await sql.transaction(queries);
}

export async function recordBackupInNeonRegistry(
  entry: {
    r2Key: string;
    label: string;
    sha256: string;
    sizeBytes: number;
    recordCounts: Record<string, number>;
    createdBy: string;
  },
  databaseUrl?: string,
): Promise<void> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) return;
  await ensureNeonSchema(url);
  const sql = neon(url);
  await sql.query(
    `INSERT INTO abwab_backup_registry (r2_key, label, sha256, size_bytes, record_counts, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (r2_key) DO UPDATE SET sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes`,
    [
      entry.r2Key,
      entry.label,
      entry.sha256,
      entry.sizeBytes,
      JSON.stringify(entry.recordCounts),
      entry.createdBy,
    ],
  );
}

export async function markBackupVerifiedInNeonRegistry(
  r2Key: string,
  databaseUrl?: string,
): Promise<void> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) return;
  await ensureNeonSchema(url);
  const sql = neon(url);
  await sql.query(`UPDATE abwab_backup_registry SET verified_at = NOW() WHERE r2_key = $1`, [
    r2Key,
  ]);
}

export async function verifyNeonMigrationParity(
  localState: AuthDatabaseState,
  databaseUrl?: string,
): Promise<NeonParityReport> {
  const url = databaseUrl || getActiveDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL غير مضبوط للتحقق من تطابق Neon PostgreSQL.');
  }

  const remote = await loadStateFromNeon(url);
  const mismatches: string[] = [];

  const localCounts: Record<string, number> = {
    users: localState.users.length,
    families: localState.families.length,
    pensionPlans: localState.pensionPlans.length,
    monthlyDisbursements: localState.monthlyDisbursements.length,
    donations: localState.donations.length,
    treasuryAccounts: localState.treasuryAccounts.length,
    financialTransactions: localState.financialTransactions.length,
    projects: localState.projects.length,
    warehouseItems: localState.warehouseItems.length,
    warehouseMovements: localState.warehouseMovements.length,
    volunteers: localState.volunteers.length,
    activities: localState.activities.length,
    tasks: localState.tasks.length,
    documents: localState.documents.length,
    auditLogs: localState.auditLogs.length,
  };

  const neonCounts: Record<string, number> = {
    users: remote?.users?.length || 0,
    families: remote?.families?.length || 0,
    pensionPlans: remote?.pensionPlans?.length || 0,
    monthlyDisbursements: remote?.monthlyDisbursements?.length || 0,
    donations: remote?.donations?.length || 0,
    treasuryAccounts: remote?.treasuryAccounts?.length || 0,
    financialTransactions: remote?.financialTransactions?.length || 0,
    projects: remote?.projects?.length || 0,
    warehouseItems: remote?.warehouseItems?.length || 0,
    warehouseMovements: remote?.warehouseMovements?.length || 0,
    volunteers: remote?.volunteers?.length || 0,
    activities: remote?.activities?.length || 0,
    tasks: remote?.tasks?.length || 0,
    documents: remote?.documents?.length || 0,
    auditLogs: remote?.auditLogs?.length || 0,
  };

  for (const key of Object.keys(localCounts)) {
    if (localCounts[key] !== neonCounts[key]) {
      mismatches.push(`عدم تطابق عدد السجلات في (${key}): محلي=${localCounts[key]}، Neon=${neonCounts[key]}`);
    }
  }

  const sumBalances = (accs: Array<{currentBalance?: string}> = []) =>
    accs.reduce((sum, a) => sum + Math.round(Number(a.currentBalance || 0) * 100), 0);
  const localBalP = sumBalances(localState.treasuryAccounts);
  const neonBalP = sumBalances(remote?.treasuryAccounts || []);
  const treasuryLocalTotal = (localBalP / 100).toFixed(2);
  const treasuryNeonTotal = (neonBalP / 100).toFixed(2);
  if (localBalP !== neonBalP) {
    mismatches.push(`عدم تطابق رصيد الخزينة: محلي=${treasuryLocalTotal}، Neon=${treasuryNeonTotal}`);
  }

  const remoteUsersById = new Map((remote?.users || []).map((u) => [u.id, u]));
  const usersHashParity = localState.users.every((u) => {
    const ru = remoteUsersById.get(u.id);
    return (
      Boolean(ru) &&
      ru!.passwordHash === u.passwordHash &&
      ru!.role === u.role &&
      (ru!.tokenVersion ?? 1) === (u.tokenVersion ?? 1)
    );
  });
  if (!usersHashParity) {
    mismatches.push('عدم تطابق بيانات المستخدمين أو تجزئة كلمات المرور أو الصلاحيات.');
  }

  const remoteFamsById = new Map((remote?.families || []).map((f) => [f.id, f]));
  const familiesNationalIdParity = localState.families.every((f) => {
    const rf = remoteFamsById.get(f.id);
    return (
      Boolean(rf) &&
      (rf!.nationalIdEncrypted || '') === (f.nationalIdEncrypted || '') &&
      (rf!.nationalIdHash || '') === (f.nationalIdHash || '')
    );
  });
  if (!familiesNationalIdParity) {
    mismatches.push('عدم تطابق الأرقام القومية المشفرة للأسر المستفيدة.');
  }

  return {
    matched: mismatches.length === 0,
    localCounts,
    neonCounts,
    treasuryLocalTotal,
    treasuryNeonTotal,
    usersHashParity,
    familiesNationalIdParity,
    mismatches,
  };
}

let syncChain: Promise<void> = Promise.resolve();
let latestPendingState: AuthDatabaseState | null = null;
let syncRunning = false;

export function scheduleNeonStateSync(state: AuthDatabaseState): void {
  if (!getActiveDatabaseUrl()) return;
  latestPendingState = state;
  if (syncRunning) return;

  syncRunning = true;
  syncChain = syncChain
    .then(async () => {
      while (latestPendingState) {
        const snapshot = latestPendingState;
        latestPendingState = null;
        try {
          await saveStateToNeon(snapshot);
        } catch (err) {
          console.error('[أبواب الخير] تعذر مزامنة البيانات مع Neon PostgreSQL:', err);
        }
      }
    })
    .finally(() => {
      syncRunning = false;
      if (latestPendingState) {
        scheduleNeonStateSync(latestPendingState);
      }
    });
}

export async function flushNeonStateSync(): Promise<void> {
  await syncChain;
}
