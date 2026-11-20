import fs from 'node:fs';
import path from 'node:path';
import {
  decryptAndVerifyBackupEnvelope,
  encryptBackupEnvelope,
  isCloudflareWorkerRuntime,
  type EncryptedBackupEnvelope,
} from './authSecurity.ts';
import type {AuthDatabaseState} from './authStore.ts';
import {
  markBackupVerifiedInNeonRegistry,
  recordBackupInNeonRegistry,
} from './neonPersistence.ts';

/**
 * Minimal typed subset of Cloudflare Workers R2Bucket binding (`env.ABWAB_FILES`).
 * Dedicated strictly to binary attachments, images, logos, and encrypted backup archives.
 */
export interface R2ObjectBodyLike {
  key: string;
  size: number;
  uploaded?: Date;
  httpMetadata?: {contentType?: string};
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface R2ListedObjectLike {
  key: string;
  size: number;
  uploaded?: Date;
  customMetadata?: Record<string, string>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: {contentType?: string};
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {prefix?: string; limit?: number}): Promise<{objects: R2ListedObjectLike[]}>;
}

export interface BackupRetentionPolicy {
  maxCount: number;
  maxAgeDays: number;
  minProtectedCount: number;
  scheduleCron: string;
  encryptionAlgorithm: 'AES-256-GCM';
}

export interface EncryptedBackupSummary {
  key: string;
  label: string;
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  sha256: string;
  counts: Record<string, number>;
  storageBackend: 'cloudflare_r2' | 'local_encrypted_vault';
}

const BACKUP_PREFIX = 'backups/encrypted/';

let runtimeR2Bucket: R2BucketLike | null = null;
let pendingR2Ops: Promise<unknown>[] = [];
let runtimeRetentionMaxCount: number | null = null;
let runtimeRetentionMaxAgeDays: number | null = null;

export function setRuntimeR2Bucket(bucket: R2BucketLike | null | undefined): void {
  runtimeR2Bucket = bucket || null;
}

export function setRuntimeRetentionConfig(params: {
  maxCount?: string | number;
  maxAgeDays?: string | number;
}): void {
  const parsedCount = Number(params.maxCount);
  runtimeRetentionMaxCount =
    Number.isFinite(parsedCount) && parsedCount > 0 ? Math.max(5, Math.floor(parsedCount)) : null;

  const parsedDays = Number(params.maxAgeDays);
  runtimeRetentionMaxAgeDays =
    Number.isFinite(parsedDays) && parsedDays > 0 ? Math.max(7, Math.floor(parsedDays)) : null;
}

export function getActiveR2Bucket(): R2BucketLike | null {
  return runtimeR2Bucket;
}

export function getObjectStorageMode(): 'cloudflare_r2' | 'local_disk' {
  return runtimeR2Bucket ? 'cloudflare_r2' : 'local_disk';
}

export function getBackupRetentionPolicy(): BackupRetentionPolicy {
  const envCount =
    typeof process !== 'undefined' && process.env?.BACKUP_RETENTION_COUNT
      ? Number(process.env.BACKUP_RETENTION_COUNT)
      : NaN;
  const maxCount =
    runtimeRetentionMaxCount ??
    (Number.isFinite(envCount) && envCount > 0 ? Math.max(5, Math.floor(envCount)) : 30);

  const envDays =
    typeof process !== 'undefined' && process.env?.BACKUP_RETENTION_DAYS
      ? Number(process.env.BACKUP_RETENTION_DAYS)
      : NaN;
  const maxAgeDays =
    runtimeRetentionMaxAgeDays ??
    (Number.isFinite(envDays) && envDays > 0 ? Math.max(7, Math.floor(envDays)) : 90);

  return {
    maxCount,
    maxAgeDays,
    minProtectedCount: 5,
    scheduleCron: '0 3 * * *', // Daily at 03:00 UTC via Cloudflare Cron Trigger
    encryptionAlgorithm: 'AES-256-GCM',
  };
}

function getLocalEncryptedBackupsDir(): string {
  const dataDir =
    typeof process !== 'undefined' && process.env?.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), 'data');
  return path.join(dataDir, 'backups', 'encrypted');
}

function getLocalUploadsDir(): string {
  const dataDir =
    typeof process !== 'undefined' && process.env?.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), 'data');
  return path.join(dataDir, 'private_uploads');
}

export function trackR2Operation(op: Promise<unknown>): void {
  const tracked = op.catch((err) => {
    console.error('[أبواب الخير] خطأ أثناء عملية تخزين Cloudflare R2:', err);
  });
  pendingR2Ops.push(tracked);
}

export async function flushPendingR2Operations(): Promise<void> {
  if (pendingR2Ops.length === 0) return;
  const batch = pendingR2Ops.splice(0, pendingR2Ops.length);
  await Promise.all(batch);
}

/**
 * Stores a private attachment/image/logo in Cloudflare R2 (or local uploads dir in Node dev).
 */
export async function putPrivateObject(params: {
  r2ObjectKey: string;
  diskFileName: string;
  buffer: Buffer | Uint8Array;
  mimeType: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const bucket = getActiveR2Bucket();
  if (bucket) {
    const bytes = new Uint8Array(params.buffer.byteLength);
    bytes.set(params.buffer);
    await bucket.put(params.r2ObjectKey, bytes, {
      httpMetadata: {contentType: params.mimeType || 'application/octet-stream'},
      customMetadata: params.metadata,
    });
    return;
  }

  if (isCloudflareWorkerRuntime()) {
    throw new Error('لم يتم ربط حاوية التخزين Cloudflare R2 (ABWAB_FILES) في بيئة التشغيل.');
  }

  const uploadsDir = getLocalUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, {recursive: true});
  }
  fs.writeFileSync(path.join(uploadsDir, path.basename(params.diskFileName)), params.buffer);
}

/**
 * Reads a private attachment/image/logo from Cloudflare R2 (or local uploads dir in Node dev).
 */
export async function getPrivateObjectBuffer(params: {
  r2ObjectKey?: string;
  diskFileName: string;
}): Promise<Buffer | null> {
  const bucket = getActiveR2Bucket();
  if (bucket && params.r2ObjectKey) {
    const obj = await bucket.get(params.r2ObjectKey);
    if (!obj) return null;
    const ab = await obj.arrayBuffer();
    return Buffer.from(ab);
  }

  if (isCloudflareWorkerRuntime()) {
    return null;
  }

  const safeName = path.basename(params.diskFileName);
  const filePath = path.join(getLocalUploadsDir(), safeName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

function summarizeStateCounts(state: AuthDatabaseState): Record<string, number> {
  return {
    users: state.users.length,
    families: state.families.length,
    pensionPlans: state.pensionPlans.length,
    monthlyDisbursements: state.monthlyDisbursements.length,
    donations: state.donations.length,
    treasuryAccounts: state.treasuryAccounts.length,
    financialTransactions: state.financialTransactions.length,
    projects: state.projects.length,
    warehouseItems: state.warehouseItems.length,
    volunteers: state.volunteers.length,
    activities: state.activities.length,
    tasks: state.tasks.length,
    documents: state.documents.length,
  };
}

/**
 * Creates an AES-256-GCM encrypted backup snapshot in Cloudflare R2 (or local encrypted vault),
 * registers metadata in Neon PostgreSQL, and enforces the configured retention policy.
 */
export async function createEncryptedBackup(
  state: AuthDatabaseState,
  options: {label?: string; createdBy?: string} = {},
): Promise<{
  backup: EncryptedBackupSummary;
  prunedKeys: string[];
  retentionPolicy: BackupRetentionPolicy;
}> {
  const safeLabel = (options.label || 'manual')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 32);
  const createdBy = options.createdBy || 'system_cron';
  const counts = summarizeStateCounts(state);

  const envelope = encryptBackupEnvelope(state, {
    label: safeLabel,
    createdBy,
    counts,
  });
  const serialized = JSON.stringify(envelope, null, 2);
  const byteSize = Buffer.byteLength(serialized, 'utf8');
  const stamp = envelope.createdAt.replace(/[:.]/g, '-');
  const key = `${BACKUP_PREFIX}${stamp}-${safeLabel}.abwab.enc.json`;

  const bucket = getActiveR2Bucket();
  let storageBackend: 'cloudflare_r2' | 'local_encrypted_vault' = 'local_encrypted_vault';

  if (bucket) {
    storageBackend = 'cloudflare_r2';
    await bucket.put(key, serialized, {
      httpMetadata: {contentType: 'application/json; charset=utf-8'},
      customMetadata: {
        label: safeLabel,
        createdAt: envelope.createdAt,
        createdBy,
        sha256: envelope.sha256,
      },
    });
  } else if (!isCloudflareWorkerRuntime()) {
    const dir = getLocalEncryptedBackupsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
    fs.writeFileSync(path.join(dir, path.basename(key)), serialized, {mode: 0o600});
  } else {
    throw new Error('حاوية Cloudflare R2 غير مرتبطة لحفظ النسخة الاحتياطية المشفرة.');
  }

  // Record encrypted backup catalog entry inside Neon PostgreSQL (when Neon is configured)
  try {
    await recordBackupInNeonRegistry({
      r2Key: key,
      label: safeLabel,
      sha256: envelope.sha256,
      sizeBytes: byteSize,
      recordCounts: counts,
      createdBy,
    });
  } catch (err) {
    console.error('[أبواب الخير] تعذر تسجيل النسخة في فهرس Neon:', err);
  }

  const retentionPolicy = getBackupRetentionPolicy();
  const prunedKeys = await enforceBackupRetentionPolicy(retentionPolicy);

  return {
    backup: {
      key,
      label: safeLabel,
      createdAt: envelope.createdAt,
      createdBy,
      sizeBytes: byteSize,
      sha256: envelope.sha256,
      counts,
      storageBackend,
    },
    prunedKeys,
    retentionPolicy,
  };
}

export async function listEncryptedBackups(): Promise<EncryptedBackupSummary[]> {
  const bucket = getActiveR2Bucket();
  const summaries: EncryptedBackupSummary[] = [];

  if (bucket) {
    const listed = await bucket.list({prefix: BACKUP_PREFIX, limit: 200});
    for (const item of listed.objects) {
      if (!item.key.endsWith('.abwab.enc.json')) continue;
      summaries.push({
        key: item.key,
        label: item.customMetadata?.label || 'backup',
        createdAt:
          item.customMetadata?.createdAt ||
          (item.uploaded ? item.uploaded.toISOString() : new Date().toISOString()),
        createdBy: item.customMetadata?.createdBy || 'system',
        sizeBytes: item.size,
        sha256: item.customMetadata?.sha256 || '',
        counts: {},
        storageBackend: 'cloudflare_r2',
      });
    }
  } else if (!isCloudflareWorkerRuntime()) {
    const dir = getLocalEncryptedBackupsDir();
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.abwab.enc.json')) continue;
        const fullPath = path.join(dir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const env = JSON.parse(raw) as EncryptedBackupEnvelope;
          const stat = fs.statSync(fullPath);
          summaries.push({
            key: `${BACKUP_PREFIX}${file}`,
            label: env.label || 'backup',
            createdAt: env.createdAt || stat.mtime.toISOString(),
            createdBy: env.createdBy || 'system',
            sizeBytes: stat.size,
            sha256: env.sha256 || '',
            counts: env.counts || {},
            storageBackend: 'local_encrypted_vault',
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function readEncryptedBackupEnvelope(key: string): Promise<EncryptedBackupEnvelope> {
  if (!key.startsWith(BACKUP_PREFIX) || !key.endsWith('.abwab.enc.json')) {
    throw new Error('معرّف النسخة الاحتياطية المشفرة غير صالح.');
  }

  const bucket = getActiveR2Bucket();
  if (bucket) {
    const obj = await bucket.get(key);
    if (!obj) {
      throw new Error('لم يتم العثور على النسخة الاحتياطية المشفرة في Cloudflare R2.');
    }
    return JSON.parse(await obj.text()) as EncryptedBackupEnvelope;
  }

  if (isCloudflareWorkerRuntime()) {
    throw new Error('حاوية Cloudflare R2 غير متصلة.');
  }

  const filePath = path.join(getLocalEncryptedBackupsDir(), path.basename(key));
  if (!fs.existsSync(filePath)) {
    throw new Error('لم يتم العثور على ملف النسخة الاحتياطية المشفرة.');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EncryptedBackupEnvelope;
}

/**
 * Dry-run verification test: downloads the encrypted backup, decrypts AES-256-GCM,
 * verifies SHA-256 checksum and structural schema WITHOUT modifying live data.
 */
export async function verifyEncryptedBackup(key: string): Promise<{
  key: string;
  verified: true;
  sha256: string;
  label: string;
  createdAt: string;
  counts: Record<string, number>;
}> {
  const envelope = await readEncryptedBackupEnvelope(key);
  const {payload, sha256} = decryptAndVerifyBackupEnvelope<AuthDatabaseState>(envelope);

  if (!payload || !Array.isArray(payload.users) || !Array.isArray(payload.treasuryAccounts)) {
    throw new Error('محتوى النسخة الاحتياطية بعد فك التشفير غير مكتمل البنية.');
  }

  try {
    await markBackupVerifiedInNeonRegistry(key);
  } catch {
    // Non-blocking when Neon is not yet connected
  }

  return {
    key,
    verified: true,
    sha256,
    label: envelope.label,
    createdAt: envelope.createdAt,
    counts: summarizeStateCounts(payload),
  };
}

/**
 * Decrypts, verifies integrity, and returns the full restorable database state.
 */
export async function loadVerifiedEncryptedBackupState(
  key: string,
): Promise<{state: AuthDatabaseState; sha256: string; envelope: EncryptedBackupEnvelope}> {
  const envelope = await readEncryptedBackupEnvelope(key);
  const {payload, sha256} = decryptAndVerifyBackupEnvelope<AuthDatabaseState>(envelope);
  if (!payload || !Array.isArray(payload.users) || !Array.isArray(payload.treasuryAccounts)) {
    throw new Error('تعذر استعادة النسخة المشفرة: بنية البيانات غير مكتملة.');
  }
  return {state: payload, sha256, envelope};
}

/**
 * Enforces retention policy (maxCount & maxAgeDays) while ALWAYS preserving
 * at least `minProtectedCount` newest snapshots.
 */
export async function enforceBackupRetentionPolicy(
  policy: BackupRetentionPolicy = getBackupRetentionPolicy(),
): Promise<string[]> {
  const all = await listEncryptedBackups();
  if (all.length <= policy.minProtectedCount) return [];

  const cutoffMs = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];

  for (let i = 0; i < all.length; i++) {
    if (i < policy.minProtectedCount) continue;
    const item = all[i];
    const itemMs = Date.parse(item.createdAt);
    const exceedsCount = i >= policy.maxCount;
    const exceedsAge = Number.isFinite(itemMs) && itemMs < cutoffMs;
    if (exceedsCount || exceedsAge) {
      toDelete.push(item.key);
    }
  }

  if (toDelete.length === 0) return [];

  const bucket = getActiveR2Bucket();
  if (bucket) {
    await bucket.delete(toDelete);
  } else if (!isCloudflareWorkerRuntime()) {
    const dir = getLocalEncryptedBackupsDir();
    for (const k of toDelete) {
      const target = path.join(dir, path.basename(k));
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
  }

  return toDelete;
}
