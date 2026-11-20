import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityTask,
  AuthUser,
  BeneficiaryFamilyRecord,
  BoardAuthorizations,
  CharityActivity,
  CharityPensionPlan,
  CharityProject,
  DonationRecord,
  FinancialTransaction,
  FundPoolType,
  ManagerModulePermissions,
  MonthlyAssistanceDisbursement,
  OrganizationSettings,
  PasswordResetRequest,
  SecurityAuditEntry,
  StoredDocumentRef,
  TreasuryAccount,
  UserGranularPermissions,
  UserRole,
  VolunteerProfile,
  WarehouseItem,
  WarehouseMovement,
} from '../src/types/auth.ts';
import {
  defaultGranularPermissionsForRole,
  defaultModulePermissionsForRole,
  encryptSensitiveText,
  hashSensitiveText,
  isCloudflareWorkerRuntime,
  maskNationalId,
} from './authSecurity.ts';
import {
  flushNeonStateSync,
  getActiveDatabaseUrl,
  getNeonStorageMode,
  loadStateFromNeon,
  saveStateToNeon,
  scheduleNeonStateSync,
  type PersistentStorageMode,
} from './neonPersistence.ts';
import {
  createEncryptedBackup,
  flushPendingR2Operations,
  getActiveR2Bucket,
  getPrivateObjectBuffer,
  putPrivateObject,
  trackR2Operation,
} from './r2Storage.ts';

export interface StoredUserRecord {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  boardPosition?: string;
  membershipStatus?: 'active' | 'inactive' | 'honorary';
  assignedActivityId: string | null;
  boardAuthorizations: BoardAuthorizations;
  granularPermissions?: UserGranularPermissions;
  modulePermissions?: ManagerModulePermissions;
  isActive: boolean;
  mustChangePassword?: boolean;
  passwordHash: string;
  tokenVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredBeneficiaryFamilyRecord extends BeneficiaryFamilyRecord {
  nationalIdEncrypted?: string;
  nationalIdHash?: string;
}

export interface StoredDocumentFileRecord extends StoredDocumentRef {
  diskFileName: string;
  r2ObjectKey?: string;
}

export interface AuthDatabaseState {
  users: StoredUserRecord[];
  activities: CharityActivity[];
  tasks: ActivityTask[];
  families: StoredBeneficiaryFamilyRecord[];
  monthlyDisbursements: MonthlyAssistanceDisbursement[];
  pensionPlans: CharityPensionPlan[];
  donations: DonationRecord[];
  treasuryAccounts: TreasuryAccount[];
  financialTransactions: FinancialTransaction[];
  projects: CharityProject[];
  warehouseItems: WarehouseItem[];
  warehouseMovements: WarehouseMovement[];
  volunteers: VolunteerProfile[];
  documents: StoredDocumentFileRecord[];
  organizationSettings: OrganizationSettings;
  passwordResetRequests: PasswordResetRequest[];
  auditLogs: SecurityAuditEntry[];
}

export const DEFAULT_BOARD_AUTHORIZATIONS: BoardAuthorizations = {
  canViewActivities: true,
  canViewTasks: true,
  canViewExecutiveSummary: true,
  canViewFamiliesSummary: true,
};

export function createZeroFundBalances(): Record<FundPoolType, string> {
  return {
    zakat_mal: '0.00',
    zakat_fitr: '0.00',
    sadaqah: '0.00',
    general: '0.00',
    project_restricted: '0.00',
  };
}

export function createDefaultOrganizationSettings(): OrganizationSettings {
  return {
    nameAr: 'أبواب الخير',
    sloganAr: 'أبواب الخير ... طريقك للخير 💚',
    secondarySloganAr: 'وهنفتح كل يوم باب جديد للخير 💚',
    registrationNumber: '',
    phone: '',
    email: '',
    address: '',
    currency: 'EGP',
    customLogoUrl: null,
    receiptPrefix: 'DON',
    receiptFooterAr: 'شكراً لعطائكم — عطاؤك اليوم يفتح باباً للأمل غداً.',
    authorizedSignerName: 'رئيس مجلس الإدارة',
    customDonationTypes: [
      'التبرعات الشهرية',
      'الصدقات',
      'زكاة المال',
      'زكاة الفطر',
      'التبرعات العامة',
      'التبرعات المخصصة لمشروع',
      'التبرعات العينية',
    ],
    customExpenseTypes: [
      'مصارف زكاة المال الشرعية',
      'مساعدات خيرية للأسر',
      'تنفيذ مشروعات خيرية',
      'مساعدات طبية وعلاجية',
      'مصروفات إدارية وتشغيلية',
    ],
    customAidTypes: [
      'معاش خير شهري',
      'دعم غذائي',
      'مساعدة علاجية',
      'مساعدة زواج',
      'سداد ديون',
      'كفالة أيتام',
    ],
    updatedAt: new Date().toISOString(),
  };
}

function createInitialMainTreasury(): TreasuryAccount {
  const now = new Date().toISOString();
  return {
    id: 'treasury-main-vault',
    name: 'الخزينة الرئيسية — أبواب الخير',
    accountType: 'cash_vault',
    bankName: '',
    accountNumberMasked: '',
    isActive: true,
    currentBalance: '0.00',
    fundBalances: createZeroFundBalances(),
    createdAt: now,
    updatedAt: now,
  };
}

function getDataDir(): string {
  const fromEnv = typeof process !== 'undefined' && process.env ? process.env.DATA_DIR : undefined;
  if (fromEnv) return path.resolve(fromEnv);
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.';
  return path.resolve(cwd, 'data');
}

function getUploadsDir(): string {
  return path.join(getDataDir(), 'private_uploads');
}

function getBackupsDir(): string {
  return path.join(getDataDir(), 'backups');
}

function getStorePath(): string {
  return path.join(getDataDir(), 'abwab_auth_store.json');
}

export function saveSafetyBackupSnapshot(label = 'auto', createdBy = 'president'): string {
  const state = readAuthStore();
  const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (isCloudflareWorkerRuntime() || getActiveR2Bucket()) {
    trackR2Operation(createEncryptedBackup(state, {label, createdBy}));
    return `r2-encrypted-${label}-${safeStamp}.abwab.enc.json`;
  }
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, {recursive: true});
  }
  const fileName = `snapshot-${label}-${safeStamp}.json`;
  const targetPath = path.join(backupsDir, fileName);
  fs.writeFileSync(targetPath, JSON.stringify(state, null, 2), 'utf8');
  return fileName;
}

function createEmptyState(): AuthDatabaseState {
  return {
    users: [],
    activities: [],
    tasks: [],
    families: [],
    monthlyDisbursements: [],
    pensionPlans: [],
    donations: [],
    treasuryAccounts: [createInitialMainTreasury()],
    financialTransactions: [],
    projects: [],
    warehouseItems: [],
    warehouseMovements: [],
    volunteers: [],
    documents: [],
    organizationSettings: createDefaultOrganizationSettings(),
    passwordResetRequests: [],
    auditLogs: [],
  };
}

function hydrateState(rawState: Partial<AuthDatabaseState>): AuthDatabaseState {
  let presidentAssigned = false;
  const rawUsers = (rawState.users || []) as Array<
    Omit<StoredUserRecord, 'role'> & {role: string}
  >;
  const hasExplicitPresident = rawUsers.some(
    (u) => u.role === 'president' || u.role === 'chairman',
  );

  const users: StoredUserRecord[] = [];
  for (const u of rawUsers) {
    // Legacy volunteer login accounts are never granted administrative login access
    if (u.role === 'volunteer') {
      continue;
    }

    let mappedRole: UserRole = 'manager';
    if ((u.role === 'president' || u.role === 'chairman') && !presidentAssigned) {
      mappedRole = 'president';
      presidentAssigned = true;
    } else if (!hasExplicitPresident && u.role === 'system_admin' && !presidentAssigned) {
      mappedRole = 'president';
      presidentAssigned = true;
    } else {
      mappedRole = 'manager';
    }

    users.push({
      ...u,
      role: mappedRole,
      boardPosition:
        u.boardPosition || (mappedRole === 'president' ? 'رئيس مجلس الإدارة' : 'مدير'),
      membershipStatus: u.membershipStatus || 'active',
      boardAuthorizations: {
        canViewActivities: u.boardAuthorizations?.canViewActivities ?? false,
        canViewTasks: u.boardAuthorizations?.canViewTasks ?? false,
        canViewExecutiveSummary: u.boardAuthorizations?.canViewExecutiveSummary ?? false,
        canViewFamiliesSummary: u.boardAuthorizations?.canViewFamiliesSummary ?? false,
      },
      granularPermissions:
        mappedRole === 'president'
          ? defaultGranularPermissionsForRole('president')
          : {
              ...defaultGranularPermissionsForRole('manager'),
              ...(u.granularPermissions || {}),
            },
      modulePermissions:
        mappedRole === 'president'
          ? defaultModulePermissionsForRole('president')
          : {
              ...defaultModulePermissionsForRole('manager'),
              ...(u.modulePermissions || {}),
            },
      mustChangePassword: mappedRole === 'president' ? false : Boolean(u.mustChangePassword),
      tokenVersion: typeof u.tokenVersion === 'number' && u.tokenVersion >= 1 ? u.tokenVersion : 1,
    });
  }

  const families = (rawState.families || []).map((f) => ({
    ...f,
    nationalIdMasked: f.nationalIdMasked || 'غير مسجل',
    hasNationalId: Boolean(f.nationalIdEncrypted || f.hasNationalId),
    address: f.address || '',
    maritalStatus: f.maritalStatus || 'married',
    economicStatus: f.economicStatus || 'low_income',
    incomeSource: f.incomeSource || '',
    approvalStatus:
      f.approvalStatus ||
      (f.eligibilityStatus === 'priority' || f.eligibilityStatus === 'eligible'
        ? 'approved'
        : 'pending_review'),
    socialResearchResult: f.socialResearchResult || '',
    socialResearchDate: f.socialResearchDate || null,
    socialResearchByName: f.socialResearchByName || null,
    attachments: f.attachments || [],
  }));

  const donations = (rawState.donations || []).map((d) => ({
    ...d,
    donorPhone: d.donorPhone || '',
    fundType:
      d.fundType ||
      (d.category === 'zakat'
        ? 'zakat_mal'
        : d.category === 'zakat_fitr'
          ? 'zakat_fitr'
          : d.category === 'sadaqah'
            ? 'sadaqah'
            : d.projectId
              ? 'project_restricted'
              : 'general'),
    treasuryAccountId: d.treasuryAccountId || null,
    treasuryAccountName: d.treasuryAccountName || null,
    projectId: d.projectId || null,
    projectName: d.projectName || null,
    inKindDescription: d.inKindDescription || '',
  }));

  const monthlyDisbursements = (rawState.monthlyDisbursements || []).map((m) => ({
    ...m,
    proofReference: m.proofReference || '',
    treasuryAccountId: m.treasuryAccountId || null,
    fundType: m.fundType || 'general',
  }));

  const tasks = (rawState.tasks || []).map((t) => ({
    ...t,
    assignedVolunteerIds: t.assignedVolunteerIds || [],
  }));

  const treasuryAccounts =
    rawState.treasuryAccounts && rawState.treasuryAccounts.length > 0
      ? rawState.treasuryAccounts.map((acc) => ({
          ...acc,
          fundBalances: {
            ...createZeroFundBalances(),
            ...(acc.fundBalances || {}),
          },
        }))
      : [createInitialMainTreasury()];

  return {
    users,
    activities: rawState.activities || [],
    tasks,
    families,
    monthlyDisbursements,
    pensionPlans: rawState.pensionPlans || [],
    donations,
    treasuryAccounts,
    financialTransactions: rawState.financialTransactions || [],
    projects: rawState.projects || [],
    warehouseItems: rawState.warehouseItems || [],
    warehouseMovements: rawState.warehouseMovements || [],
    volunteers: rawState.volunteers || [],
    documents: rawState.documents || [],
    organizationSettings: {
      ...createDefaultOrganizationSettings(),
      ...(rawState.organizationSettings || {}),
    },
    passwordResetRequests: rawState.passwordResetRequests || [],
    auditLogs: rawState.auditLogs || [],
  };
}

let memoryCache: AuthDatabaseState | null = null;
let cachedFileSig: string | null = null;
let workerStateDirty = false;

function getStoreFileSignature(): string | null {
  try {
    const stat = fs.statSync(getStorePath());
    return `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

export function resetWorkerMemoryStateForTest(): void {
  memoryCache = null;
  cachedFileSig = null;
  workerStateDirty = false;
}

export async function beginWorkerRequestStore(databaseUrl?: string): Promise<void> {
  workerStateDirty = false;
  const activeUrl = databaseUrl || getActiveDatabaseUrl();
  if (activeUrl) {
    const remoteRaw = await loadStateFromNeon(activeUrl);
    if (remoteRaw) {
      memoryCache = hydrateState(remoteRaw);
    } else if (!memoryCache) {
      memoryCache = createEmptyState();
    }
    return;
  }
  if (!memoryCache) {
    memoryCache = createEmptyState();
  }
}

export async function commitWorkerRequestStore(databaseUrl?: string): Promise<void> {
  await flushPendingR2Operations();
  if (!workerStateDirty || !memoryCache) return;
  const activeUrl = databaseUrl || getActiveDatabaseUrl();
  if (activeUrl) {
    await saveStateToNeon(memoryCache, activeUrl);
  }
  workerStateDirty = false;
}

export function readAuthStore(): AuthDatabaseState {
  if (isCloudflareWorkerRuntime()) {
    if (!memoryCache) {
      memoryCache = createEmptyState();
    }
    return memoryCache;
  }

  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {recursive: true});
  }
  const currentSig = getStoreFileSignature();
  if (memoryCache && currentSig && cachedFileSig === currentSig) {
    return memoryCache;
  }
  if (!currentSig) {
    memoryCache = createEmptyState();
    writeAuthStore(memoryCache);
    return memoryCache;
  }
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    memoryCache = hydrateState(JSON.parse(raw) as Partial<AuthDatabaseState>);
    cachedFileSig = currentSig;
    return memoryCache;
  } catch {
    memoryCache = createEmptyState();
    writeAuthStore(memoryCache);
    return memoryCache;
  }
}

export function getPersistentStorageMode(): PersistentStorageMode {
  return getNeonStorageMode();
}

export async function initAuthStore(): Promise<PersistentStorageMode> {
  const mode = getNeonStorageMode();
  if (mode === 'local_disk') {
    readAuthStore();
    return mode;
  }

  try {
    const remoteRaw = await loadStateFromNeon();
    if (remoteRaw) {
      const hydrated = hydrateState(remoteRaw);
      if (isCloudflareWorkerRuntime()) {
        memoryCache = hydrated;
      } else {
        writeLocalStoreOnly(hydrated);
      }
      console.log(`[أبواب الخير] تم تحميل قاعدة البيانات الدائمة بنجاح (${mode}).`);
    } else {
      // Remote Neon DB is empty on first boot: preserve any existing local records by syncing them up
      const localState = readAuthStore();
      scheduleNeonStateSync(localState);
      await flushNeonStateSync();
      console.log(`[أبواب الخير] تمت تهيئة Neon PostgreSQL ومزامنة البيانات الحالية (${mode}).`);
    }
  } catch (err) {
    console.error(
      `[أبواب الخير] تحذير: تعذر الاتصال بقاعدة البيانات الدائمة (${mode})، تم التحويل المؤقت للمخزن المحلي:`,
      err,
    );
    readAuthStore();
  }

  return mode;
}

export async function shutdownAuthStore(): Promise<void> {
  await flushPendingR2Operations();
  await flushNeonStateSync();
}

function writeLocalStoreOnly(state: AuthDatabaseState): void {
  const dataDir = getDataDir();
  const storePath = getStorePath();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {recursive: true});
  }
  memoryCache = state;
  const tmpPath = `${storePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, storePath);
  cachedFileSig = getStoreFileSignature();
}

export function writeAuthStore(state: AuthDatabaseState): void {
  if (isCloudflareWorkerRuntime()) {
    memoryCache = state;
    workerStateDirty = true;
    return;
  }
  writeLocalStoreOnly(state);
  scheduleNeonStateSync(state);
}

export function replaceAuthStoreState(nextState: Partial<AuthDatabaseState>): AuthDatabaseState {
  const hydrated = hydrateState(nextState);
  writeAuthStore(hydrated);
  return hydrated;
}

export function toPublicUser(state: AuthDatabaseState, record: StoredUserRecord): AuthUser {
  const activity = record.assignedActivityId
    ? state.activities.find((a) => a.id === record.assignedActivityId) || null
    : null;
  return {
    id: record.id,
    fullName: record.fullName,
    username: record.username,
    email: record.email,
    phone: record.phone,
    role: record.role,
    boardPosition:
      record.boardPosition || (record.role === 'president' ? 'رئيس مجلس الإدارة' : 'مدير'),
    membershipStatus: record.membershipStatus || 'active',
    assignedActivityId: activity ? activity.id : record.assignedActivityId,
    assignedActivityName: activity ? activity.name : null,
    boardAuthorizations: record.boardAuthorizations,
    granularPermissions:
      record.role === 'president'
        ? defaultGranularPermissionsForRole('president')
        : {
            ...defaultGranularPermissionsForRole('manager'),
            ...(record.granularPermissions || {}),
          },
    modulePermissions:
      record.role === 'president'
        ? defaultModulePermissionsForRole('president')
        : {
            ...defaultModulePermissionsForRole('manager'),
            ...(record.modulePermissions || {}),
          },
    isActive: record.isActive,
    mustChangePassword: record.role === 'president' ? false : Boolean(record.mustChangePassword),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toPublicFamily(record: StoredBeneficiaryFamilyRecord): BeneficiaryFamilyRecord {
  const {nationalIdEncrypted: _enc, nationalIdHash: _hash, ...rest} = record;
  return {
    ...rest,
    hasNationalId: Boolean(record.nationalIdEncrypted || record.hasNationalId),
  };
}

export function applyNationalIdProtection(
  record: StoredBeneficiaryFamilyRecord,
  plainNationalId: string,
): void {
  const clean = plainNationalId.trim();
  if (!clean) return;
  record.nationalIdEncrypted = encryptSensitiveText(clean);
  record.nationalIdHash = hashSensitiveText(clean);
  record.nationalIdMasked = maskNationalId(clean);
  record.hasNationalId = true;
}

export function savePrivateDocument(params: {
  state: AuthDatabaseState;
  fileName: string;
  mimeType: string;
  base64Data: string;
  entityType: 'family' | 'project' | 'organization';
  entityId: string;
  uploadedBy: string;
  uploadedByName: string;
}): StoredDocumentRef {
  const cleanBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    throw new Error('حجم الملف غير صالح (الحد الأقصى 5 ميجابايت).');
  }
  const id = crypto.randomUUID();
  const safeExt = path.extname(params.fileName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const diskFileName = `${id}${safeExt}`;
  const r2ObjectKey = `documents/${params.entityType}/${params.entityId}/${diskFileName}`;

  if (getActiveR2Bucket()) {
    trackR2Operation(
      putPrivateObject({
        r2ObjectKey,
        diskFileName,
        buffer,
        mimeType: params.mimeType || 'application/octet-stream',
        metadata: {
          entityType: params.entityType,
          entityId: params.entityId,
          uploadedBy: params.uploadedBy,
        },
      }),
    );
  } else if (!isCloudflareWorkerRuntime()) {
    const uploadsDir = getUploadsDir();
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, {recursive: true});
    }
    fs.writeFileSync(path.join(uploadsDir, diskFileName), buffer);
  } else {
    throw new Error('لم يتم ربط حاوية التخزين Cloudflare R2 (ABWAB_FILES) لرفع المرفق.');
  }

  const docRecord: StoredDocumentFileRecord = {
    id,
    fileName: params.fileName.slice(0, 120),
    mimeType: params.mimeType || 'application/octet-stream',
    sizeBytes: buffer.length,
    entityType: params.entityType,
    entityId: params.entityId,
    uploadedBy: params.uploadedBy,
    uploadedByName: params.uploadedByName,
    uploadedAt: new Date().toISOString(),
    diskFileName,
    r2ObjectKey,
  };
  params.state.documents.unshift(docRecord);
  const {diskFileName: _disk, r2ObjectKey: _r2, ...publicRef} = docRecord;
  return publicRef;
}

export async function readPrivateDocumentBufferAsync(
  doc: StoredDocumentFileRecord,
): Promise<Buffer | null> {
  return getPrivateObjectBuffer({
    r2ObjectKey:
      doc.r2ObjectKey || `documents/${doc.entityType}/${doc.entityId}/${doc.diskFileName}`,
    diskFileName: doc.diskFileName,
  });
}

export function readPrivateDocumentBuffer(doc: StoredDocumentFileRecord): Buffer | null {
  if (isCloudflareWorkerRuntime()) return null;
  const safeName = path.basename(doc.diskFileName);
  const filePath = path.join(getUploadsDir(), safeName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function generateFamilyFileNumber(state: AuthDatabaseState): string {
  const year = new Date().getFullYear();
  const seq = state.families.length + 1;
  return `FAM-${year}-${String(seq).padStart(4, '0')}`;
}

export function generateDonationReceiptNumber(state: AuthDatabaseState): string {
  const year = new Date().getFullYear();
  const prefix = state.organizationSettings.receiptPrefix || 'DON';
  const seq = state.donations.length + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

export function generateFinancialEntryNumber(state: AuthDatabaseState): string {
  const year = new Date().getFullYear();
  const seq = state.financialTransactions.length + 1;
  return `FIN-${year}-${String(seq).padStart(4, '0')}`;
}

export function generateProjectCode(state: AuthDatabaseState): string {
  const year = new Date().getFullYear();
  const seq = state.projects.length + 1;
  return `PRJ-${year}-${String(seq).padStart(3, '0')}`;
}

export function generateWarehouseCode(state: AuthDatabaseState): string {
  const seq = state.warehouseItems.length + 1;
  return `WH-${String(seq).padStart(4, '0')}`;
}

export function logSecurityEvent(
  state: AuthDatabaseState,
  entry: Omit<SecurityAuditEntry, 'id' | 'createdAt'>,
): void {
  state.auditLogs.unshift({
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  if (state.auditLogs.length > 1000) {
    state.auditLogs = state.auditLogs.slice(0, 1000);
  }
}
