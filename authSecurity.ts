import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  GRANULAR_PERM_LABELS_AR,
  MODULE_PERM_LABELS_AR,
  ROLE_META,
  type BoardAuthorizations,
  type ManagerModulePermissions,
  type RolePermissionMatrix,
  type UserGranularPermissions,
  type UserRole,
} from '../src/types/auth.ts';

const PLACEHOLDER_SECRET = 'REPLACE_WITH_STRONG_RANDOM_SECRET';

let runtimeInjectedSecret: string | null = null;
let cachedLocalSecret: string | null = null;
let isWorkerEnvironment = false;

/**
 * Configure the active SESSION_SECRET from Cloudflare Workers `env.SESSION_SECRET`
 * (or any server runtime) without touching the local filesystem.
 */
export function setRuntimeSessionSecret(secret: string | undefined, workerMode = false): void {
  isWorkerEnvironment = workerMode;
  const trimmed = (secret || '').trim();
  if (trimmed && trimmed !== PLACEHOLDER_SECRET && trimmed.length >= 32) {
    runtimeInjectedSecret = trimmed;
  } else {
    runtimeInjectedSecret = null;
  }
}

export function isCloudflareWorkerRuntime(): boolean {
  return isWorkerEnvironment;
}

function getActiveSessionSecret(): string {
  if (runtimeInjectedSecret) {
    return runtimeInjectedSecret;
  }

  const envSecret =
    typeof process !== 'undefined' && process.env ? (process.env.SESSION_SECRET || '').trim() : '';
  if (envSecret && envSecret !== PLACEHOLDER_SECRET && envSecret.length >= 32) {
    return envSecret;
  }

  if (isWorkerEnvironment) {
    throw new Error(
      'خطأ أمني في الإعدادات: المتغير السري SESSION_SECRET غير مضبوط في بيئة Cloudflare Workers (يجب أن لا يقل عن 32 حرفاً).',
    );
  }

  if (cachedLocalSecret) {
    return cachedLocalSecret;
  }

  // Local Node.js development fallback only (never executed inside Cloudflare Workers)
  const dataDir =
    typeof process !== 'undefined' && process.env?.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), 'data');
  const secretFile = path.join(dataDir, '.abwab_auth_secret');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {recursive: true});
  }
  if (fs.existsSync(secretFile)) {
    cachedLocalSecret = fs.readFileSync(secretFile, 'utf8').trim();
    return cachedLocalSecret;
  }
  const generated = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(secretFile, generated, {mode: 0o600});
  cachedLocalSecret = generated;
  return generated;
}

function getFieldEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(getActiveSessionSecret()).digest();
}

function getBackupEncryptionKey(): Buffer {
  return crypto
    .createHash('sha256')
    .update(`abwab-backup-v1:${getActiveSessionSecret()}`)
    .digest();
}

/**
 * Encrypt sensitive personal data (such as Egyptian National IDs) at rest with AES-256-GCM.
 */
export function encryptSensitiveText(plain: string): string {
  const clean = plain.trim();
  if (!clean) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getFieldEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitiveText(cipherText: string): string {
  if (!cipherText) return '';
  try {
    const [ivHex, tagHex, dataHex] = cipherText.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getFieldEncryptionKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
}

export function hashSensitiveText(plain: string): string {
  const clean = plain.trim();
  if (!clean) return '';
  return crypto
    .createHmac('sha256', getFieldEncryptionKey())
    .update(clean)
    .digest('hex');
}

export interface EncryptedBackupEnvelope {
  format: 'abwab-encrypted-backup';
  version: 1;
  alg: 'aes-256-gcm';
  label: string;
  createdAt: string;
  createdBy: string;
  sha256: string;
  counts: Record<string, number>;
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * Encrypts a complete database state snapshot with AES-256-GCM + SHA-256 integrity seal
 * for secure storage in Cloudflare R2 (or local encrypted backup vault).
 */
export function encryptBackupEnvelope(
  payloadObj: unknown,
  meta: {label: string; createdBy: string; counts: Record<string, number>},
): EncryptedBackupEnvelope {
  const plaintext = JSON.stringify(payloadObj);
  const sha256 = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getBackupEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    format: 'abwab-encrypted-backup',
    version: 1,
    alg: 'aes-256-gcm',
    label: meta.label,
    createdAt: new Date().toISOString(),
    createdBy: meta.createdBy,
    sha256,
    counts: meta.counts,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: encrypted.toString('base64'),
  };
}

/**
 * Decrypts an AES-256-GCM backup archive and verifies both the GCM authentication tag
 * and the SHA-256 payload checksum to guarantee zero tampering or corruption.
 */
export function decryptAndVerifyBackupEnvelope<T = unknown>(
  envelope: EncryptedBackupEnvelope,
): {payload: T; sha256: string; verified: true} {
  if (
    !envelope ||
    envelope.format !== 'abwab-encrypted-backup' ||
    envelope.version !== 1 ||
    envelope.alg !== 'aes-256-gcm' ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.ciphertext
  ) {
    throw new Error('بنية ملف النسخة الاحتياطية المشفرة غير صالحة أو تالفة.');
  }

  let plaintext: string;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getBackupEncryptionKey(),
      Buffer.from(envelope.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    plaintext = decrypted.toString('utf8');
  } catch {
    throw new Error(
      'فشل فك تشفير النسخة الاحتياطية: إما أن الملف تعرّض للتلاعب أو أن مفتاح SESSION_SECRET غير مطابق.',
    );
  }

  const computedHash = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
  if (computedHash !== envelope.sha256) {
    throw new Error('فشل التحقق من سلامة النسخة الاحتياطية (عدم تطابق بصمة SHA-256).');
  }

  return {
    payload: JSON.parse(plaintext) as T,
    sha256: computedHash,
    verified: true,
  };
}

export function maskNationalId(nationalId: string): string {
  const clean = nationalId.trim();
  if (!clean) return 'غير مسجل';
  if (clean.length <= 5) return '•••••';
  return `${clean.slice(0, 4)}••••••${clean.slice(-2)}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export interface TokenPayload {
  sub: string;
  username: string;
  ver: number;
  iat: number;
  exp: number;
}

export function signToken(userId: string, username: string, tokenVersion = 1): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: userId,
    username,
    ver: tokenVersion,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const headerB64 = Buffer.from(JSON.stringify({alg: 'HS256', typ: 'JWT'})).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getActiveSessionSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expected = crypto
      .createHmac('sha256', getActiveSessionSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const actual = Buffer.from(sigB64, 'base64url');
    if (expected.length !== actual.length) return null;
    if (!crypto.timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as TokenPayload;
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateRecoveryCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * Exact fixed-decimal EGP arithmetic using integer piasters (1 EGP = 100 piasters).
 */
export function parseMoneyToPiasters(value: string | number): bigint {
  const normalized = String(value).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('صيغة المبلغ المالي غير صالحة. يرجى إدخال رقم صحيح حتى قرشين.');
  }
  const isNeg = normalized.startsWith('-');
  const absStr = isNeg ? normalized.slice(1) : normalized;
  const [wholePart, fracPart = ''] = absStr.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const piasters = BigInt(wholePart) * 100n + BigInt(paddedFrac);
  return isNeg ? -piasters : piasters;
}

export function formatPiastersToDecimal(piasters: bigint): string {
  const isNeg = piasters < 0n;
  const abs = isNeg ? -piasters : piasters;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${isNeg ? '-' : ''}${whole.toString()}.${frac}`;
}

export function normalizePositiveMoney(value: string | number): string {
  const piasters = parseMoneyToPiasters(value);
  if (piasters <= 0n) {
    throw new Error('يجب أن يكون المبلغ المالي أكبر من صفر.');
  }
  return formatPiastersToDecimal(piasters);
}

export function normalizeNonNegativeMoney(value: string | number): string {
  const piasters = parseMoneyToPiasters(value);
  if (piasters < 0n) {
    throw new Error('لا يمكن أن يكون المبلغ المالي سالباً.');
  }
  return formatPiastersToDecimal(piasters);
}

export function defaultGranularPermissionsForRole(role: UserRole): UserGranularPermissions {
  if (role === 'president') {
    return {
      canViewData: true,
      canAddData: true,
      canEditData: true,
      canDeleteData: true,
      canApproveTransactions: true,
      canExecuteFinancial: true,
      canExportReports: true,
    };
  }
  return {
    canViewData: false,
    canAddData: false,
    canEditData: false,
    canDeleteData: false,
    canApproveTransactions: false,
    canExecuteFinancial: false,
    canExportReports: false,
  };
}

export function defaultModulePermissionsForRole(role: UserRole): ManagerModulePermissions {
  if (role === 'president') {
    return {
      families: true,
      pensions: true,
      donations: true,
      finance: true,
      projects: true,
      warehouse: true,
      volunteers: true,
      activities: true,
      reports: true,
    };
  }
  return {
    families: false,
    pensions: false,
    donations: false,
    finance: false,
    projects: false,
    warehouse: false,
    volunteers: false,
    activities: false,
    reports: false,
  };
}

export function buildRolePermissions(
  role: UserRole,
  _boardAuth: BoardAuthorizations,
  _assignedActivityId: string | null,
  customGranular?: Partial<UserGranularPermissions>,
  customModules?: Partial<ManagerModulePermissions>,
): RolePermissionMatrix {
  const meta = ROLE_META[role];

  if (role === 'president') {
    const g = defaultGranularPermissionsForRole('president');
    const m = defaultModulePermissionsForRole('president');
    return {
      ...g,
      modulePermissions: m,
      canManageUsers: true,
      canManageRoles: true,
      canManagePasswordResets: true,
      canViewSecurityLogs: true,
      canManageSettings: true,
      canCreateActivities: true,
      canViewAllActivities: true,
      canManageAssignedActivityOnly: false,
      canViewAuthorizedBoardData: true,
      canParticipateInTasks: false,
      canCreateTasks: true,
      canViewFamiliesStats: true,
      canManageFamilies: true,
      canViewMonthlyAssistanceStats: true,
      canRecordMonthlyAssistance: true,
      canViewFinancialGovernance: true,
      canRecordDonations: true,
      canViewTreasury: true,
      canManageWarehouse: true,
      canManageProjects: true,
      canManageVolunteers: true,
      canManageBoardRegistry: true,
      statsScopeLabelAr: 'كامل الجمعية (صلاحية رئيس مجلس الإدارة الكاملة)',
      summaryAr: meta.shortDescAr,
      capabilitiesAr: meta.capabilitiesAr,
    };
  }

  const baseG = defaultGranularPermissionsForRole('manager');
  const baseM = defaultModulePermissionsForRole('manager');
  const g: UserGranularPermissions = {
    canViewData: customGranular?.canViewData ?? baseG.canViewData,
    canAddData: customGranular?.canAddData ?? baseG.canAddData,
    canEditData: customGranular?.canEditData ?? baseG.canEditData,
    canDeleteData: customGranular?.canDeleteData ?? baseG.canDeleteData,
    canApproveTransactions:
      customGranular?.canApproveTransactions ?? baseG.canApproveTransactions,
    canExecuteFinancial: customGranular?.canExecuteFinancial ?? baseG.canExecuteFinancial,
    canExportReports: customGranular?.canExportReports ?? baseG.canExportReports,
  };
  const m: ManagerModulePermissions = {
    families: customModules?.families ?? baseM.families,
    pensions: customModules?.pensions ?? baseM.pensions,
    donations: customModules?.donations ?? baseM.donations,
    finance: customModules?.finance ?? baseM.finance,
    projects: customModules?.projects ?? baseM.projects,
    warehouse: customModules?.warehouse ?? baseM.warehouse,
    volunteers: customModules?.volunteers ?? baseM.volunteers,
    activities: customModules?.activities ?? baseM.activities,
    reports: customModules?.reports ?? baseM.reports,
  };

  const enabledModules = (Object.keys(m) as Array<keyof ManagerModulePermissions>).filter(
    (k) => m[k],
  );
  const enabledActions = (Object.keys(g) as Array<keyof UserGranularPermissions>).filter(
    (k) => g[k],
  );

  const dynamicCaps: string[] = [];
  if (enabledModules.length > 0) {
    dynamicCaps.push(
      `الأقسام المصرح بها: ${enabledModules.map((k) => MODULE_PERM_LABELS_AR[k]).join('، ')}`,
    );
  }
  if (enabledActions.length > 0) {
    dynamicCaps.push(
      `الصلاحيات الإجرائية المفعّلة: ${enabledActions.map((k) => GRANULAR_PERM_LABELS_AR[k]).join('، ')}`,
    );
  }
  if (enabledModules.length === 0 || enabledActions.length === 0) {
    dynamicCaps.push(
      'حساب مدير بدون صلاحيات مفعّلة بالكامل — بانتظار تحديد الأقسام والصلاحيات من رئيس مجلس الإدارة',
    );
  }

  const hasAnyAccess = enabledModules.length > 0 && enabledActions.length > 0;

  return {
    ...g,
    modulePermissions: m,
    canManageUsers: false,
    canManageRoles: false,
    canManagePasswordResets: false,
    canViewSecurityLogs: false,
    canManageSettings: false,
    canCreateActivities: m.activities && g.canAddData,
    canViewAllActivities: m.activities && g.canViewData,
    canManageAssignedActivityOnly: false,
    canViewAuthorizedBoardData: false,
    canParticipateInTasks: false,
    canCreateTasks: (m.activities || m.volunteers) && g.canAddData,
    canViewFamiliesStats: m.families && g.canViewData,
    canManageFamilies: m.families && g.canViewData,
    canViewMonthlyAssistanceStats: (m.pensions || m.families) && g.canViewData,
    canRecordMonthlyAssistance: m.pensions && g.canExecuteFinancial,
    canViewFinancialGovernance: (m.donations || m.finance) && g.canViewData,
    canRecordDonations: m.donations && g.canAddData,
    canViewTreasury:
      m.finance && (g.canViewData || g.canApproveTransactions || g.canExecuteFinancial),
    canManageWarehouse: m.warehouse && g.canViewData,
    canManageProjects: m.projects && g.canViewData,
    canManageVolunteers: m.volunteers && g.canViewData,
    canManageBoardRegistry: false,
    statsScopeLabelAr: hasAnyAccess
      ? 'نطاق الأقسام والصلاحيات المعتمدة للمدير'
      : 'بانتظار تحديد الصلاحيات من رئيس مجلس الإدارة',
    summaryAr: meta.shortDescAr,
    capabilitiesAr: dynamicCaps,
  };
}
