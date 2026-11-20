/**
 * أبواب الخير (Abwab El Khair) — Safe Non-Destructive Migration to Neon PostgreSQL & Cloudflare R2
 *
 * Safety Guarantees:
 *   1. NEVER modifies or deletes `data/abwab_auth_store.json` or existing local backups.
 *   2. Creates and cryptographically verifies an AES-256-GCM pre-migration backup snapshot FIRST.
 *   3. Initializes the normalized Neon PostgreSQL schema and migrates all structured records atomically.
 *   4. Runs full parity verification (record counts across 15 collections, exact piaster treasury balance sum,
 *      every user's passwordHash/role/tokenVersion, and every family's AES-256-GCM encrypted National ID).
 *   5. Audits local `data/private_uploads/` files and prints exact `wrangler r2 object put` commands
 *      to upload any attachments to `abwab-el-khair-files` without data loss.
 *
 * Usage (ONLY after setting DATABASE_URL and SESSION_SECRET in .env):
 *   npx tsx scripts/migrate-to-neon-r2.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {readAuthStore} from '../server/authStore.ts';
import {
  ensureNeonSchema,
  saveStateToNeon,
  verifyNeonMigrationParity,
} from '../server/neonPersistence.ts';
import {createEncryptedBackup, verifyEncryptedBackup} from '../server/r2Storage.ts';

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    console.error('❌ متغير البيئة DATABASE_URL غير مضبوط. يرجى إضافته في .env قبل تشغيل الترحيل.');
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32) {
    console.error(
      '❌ متغير البيئة SESSION_SECRET غير مضبوط أو قصير جداً (يجب ألا يقل عن 32 حرفاً).',
    );
    process.exit(1);
  }

  console.log('=== [1/4] قراءة قاعدة البيانات المحلية الحالية (بدون أي تعديل أو حذف) ===');
  const localState = readAuthStore();
  console.log(
    `المستخدمون: ${localState.users.length} | الأسر: ${localState.families.length} | التبرعات: ${localState.donations.length} | الخزائن: ${localState.treasuryAccounts.length} | المعاملات: ${localState.financialTransactions.length} | المستندات: ${localState.documents.length}`,
  );

  console.log('\n=== [2/4] إنشاء نسخة احتياطية مشفرة (AES-256-GCM) قبل الترحيل والتحقق من سلامتها ===');
  const preBackup = await createEncryptedBackup(localState, {
    label: 'pre-neon-migration',
    createdBy: 'migration_script',
  });
  const verifiedBackup = await verifyEncryptedBackup(preBackup.backup.key);
  console.log(`✅ تم حفظ وتوثيق النسخة الاحتياطية المشفرة: ${preBackup.backup.key}`);
  console.log(`   SHA-256: ${verifiedBackup.sha256}`);

  console.log('\n=== [3/4] تهيئة جداول Neon PostgreSQL وترحيل البيانات المنظمة بالكامل ===');
  await ensureNeonSchema(databaseUrl);
  await saveStateToNeon(localState, databaseUrl);
  console.log('✅ تمت كتابة جميع السجلات داخل معاملة SQL واحدة في Neon PostgreSQL.');

  console.log('\n=== [4/4] التحقق الكامل من التطابق (Parity Verification) ===');
  const parity = await verifyNeonMigrationParity(localState, databaseUrl);
  console.log(JSON.stringify(parity, null, 2));

  if (!parity.matched) {
    console.error('❌ فشل التحقق من التطابق! لم يتم حذف أو تعديل أي ملف محلي.');
    process.exit(2);
  }

  // Audit local binary uploads that should be copied to Cloudflare R2
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');
  const uploadsDir = path.join(dataDir, 'private_uploads');
  const pendingR2Uploads: Array<{localPath: string; r2Key: string}> = [];

  for (const doc of localState.documents) {
    const localFile = path.join(uploadsDir, path.basename(doc.diskFileName));
    if (fs.existsSync(localFile)) {
      const r2Key =
        doc.r2ObjectKey || `documents/${doc.entityType}/${doc.entityId}/${doc.diskFileName}`;
      pendingR2Uploads.push({localPath: localFile, r2Key});
    }
  }

  console.log('\n✅ اكتمل التحقق من تطابق Neon PostgreSQL بنسبة 100%!');
  console.log(
    `ℹ️  قاعدة البيانات المحلية الأصلية (${path.join(dataDir, 'abwab_auth_store.json')}) محفوظة كما هي دون مساس.`,
  );

  if (pendingR2Uploads.length > 0) {
    console.log(`\n📦 يوجد (${pendingR2Uploads.length}) مرفق محلي جاهز للرفع إلى حاوية Cloudflare R2:`);
    for (const item of pendingR2Uploads) {
      console.log(
        `   npx wrangler r2 object put abwab-el-khair-files/${item.r2Key} --file="${item.localPath}" --remote`,
      );
    }
  } else {
    console.log('📦 لا توجد مرفقات محلية مؤجلة للرفع إلى Cloudflare R2.');
  }
}

main().catch((err) => {
  console.error('❌ تعذر إكمال الترحيل:', err);
  process.exit(1);
});
