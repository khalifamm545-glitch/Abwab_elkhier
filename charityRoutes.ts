import crypto from 'node:crypto';
import {z} from 'zod';
import {
  DONATION_CATEGORY_LABELS_AR,
  FAMILY_APPROVAL_LABELS_AR,
  FUND_POOL_LABELS_AR,
  PENSION_STATUS_LABELS_AR,
  type AppNotification,
  type CharityPensionPlan,
  type CharityProject,
  type CharityProjectWithMetrics,
  type DonationRecord,
  type FamilyAssistanceHistory,
  type FinancialTransaction,
  type FundPoolType,
  type MonthlyAssistanceDisbursement,
  type PensionMonthRow,
  type TreasuryAccount,
  type VolunteerProfile,
  type WarehouseItem,
  type WarehouseMovement,
} from '../src/types/auth.ts';
import {
  decryptSensitiveText,
  formatPiastersToDecimal,
  hashSensitiveText,
  normalizeNonNegativeMoney,
  normalizePositiveMoney,
  parseMoneyToPiasters,
} from './authSecurity.ts';
import {
  applyNationalIdProtection,
  createZeroFundBalances,
  generateDonationReceiptNumber,
  generateFamilyFileNumber,
  generateFinancialEntryNumber,
  generateProjectCode,
  generateWarehouseCode,
  logSecurityEvent,
  readAuthStore,
  readPrivateDocumentBufferAsync,
  replaceAuthStoreState,
  savePrivateDocument,
  saveSafetyBackupSnapshot,
  toPublicFamily,
  toPublicUser,
  writeAuthStore,
  type AuthDatabaseState,
  type StoredBeneficiaryFamilyRecord,
} from './authStore.ts';
import {
  assertFundPurposeCompatibility,
  creditTreasuryAccount,
  debitTreasuryAccount,
  getCurrentMonthKey,
  listMonthKeysRange,
  mapDonationCategoryToFundPool,
  requireAuth,
  requireGranular,
  requireModule,
  requireRoles,
  sendError,
  type AuthedRequest,
} from './middleware.ts';
import {
  createEncryptedBackup,
  getBackupRetentionPolicy,
  getObjectStorageMode,
  listEncryptedBackups,
  loadVerifiedEncryptedBackupState,
  verifyEncryptedBackup,
} from './r2Storage.ts';
import {reportsApiRouter} from './reportsRoutes.ts';
import {createUniversalRouter, type UniversalResponse} from './universalRouter.ts';

export const charityApiRouter = createUniversalRouter();

// Mount all 12 official reporting endpoints under /api/reports/:reportType
charityApiRouter.use(reportsApiRouter);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createFamilySchema = z.object({
  headOfHousehold: z.string().trim().min(3, 'اسم رب الأسرة يجب أن يكون ٣ أحرف على الأقل.'),
  nationalId: z.string().trim().max(20).optional().default(''),
  governorate: z.string().trim().min(2, 'يرجى تحديد المحافظة أو المنطقة.'),
  address: z.string().trim().max(260).optional().default(''),
  phone: z.string().trim().min(6, 'يرجى إدخال رقم تواصل صحيح.').max(30),
  membersCount: z.coerce.number().int().min(1, 'عدد أفراد الأسرة يجب أن يكون فرداً واحداً على الأقل.').max(40),
  maritalStatus: z
    .enum(['married', 'widowed', 'divorced', 'single', 'elderly_care'])
    .optional()
    .default('married'),
  economicStatus: z
    .enum(['no_income', 'irregular_income', 'low_income', 'urgent_medical_need'])
    .optional()
    .default('low_income'),
  incomeSource: z.string().trim().max(180).optional().default(''),
  eligibilityStatus: z.enum(['priority', 'eligible', 'pending_review', 'suspended']),
  approvalStatus: z.enum(['approved', 'rejected', 'pending_review']).optional(),
  supportType: z.enum(['monthly_pension', 'food_support', 'medical_support', 'orphan_sponsorship']),
  monthlyAssistanceEnabled: z.boolean(),
  monthlyAssistanceAmount: z.union([z.string(), z.number()]).default('0.00'),
  activityId: z.string().nullable().optional(),
  notes: z.string().trim().max(600).optional().default(''),
});

const updateFamilySchema = z.object({
  headOfHousehold: z.string().trim().min(3).optional(),
  nationalId: z.string().trim().max(20).optional(),
  governorate: z.string().trim().min(2).optional(),
  address: z.string().trim().max(260).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  membersCount: z.coerce.number().int().min(1).max(40).optional(),
  maritalStatus: z.enum(['married', 'widowed', 'divorced', 'single', 'elderly_care']).optional(),
  economicStatus: z
    .enum(['no_income', 'irregular_income', 'low_income', 'urgent_medical_need'])
    .optional(),
  incomeSource: z.string().trim().max(180).optional(),
  eligibilityStatus: z.enum(['priority', 'eligible', 'pending_review', 'suspended']).optional(),
  supportType: z
    .enum(['monthly_pension', 'food_support', 'medical_support', 'orphan_sponsorship'])
    .optional(),
  monthlyAssistanceEnabled: z.boolean().optional(),
  monthlyAssistanceAmount: z.union([z.string(), z.number()]).optional(),
  activityId: z.string().nullable().optional(),
  notes: z.string().trim().max(600).optional(),
});

const socialResearchSchema = z.object({
  socialResearchResult: z.string().trim().min(4, 'يرجى كتابة خلاصة البحث الاجتماعي الميداني.').max(1200),
  approvalStatus: z.enum(['approved', 'rejected', 'pending_review']),
  eligibilityStatus: z.enum(['priority', 'eligible', 'pending_review', 'suspended']).optional(),
});

const uploadDocumentSchema = z.object({
  fileName: z.string().trim().min(1, 'يرجى تحديد اسم الملف.').max(140),
  mimeType: z.string().trim().min(3).max(120),
  base64Data: z.string().min(8, 'محتوى الملف غير صالح.'),
});

const createPensionSchema = z.object({
  familyId: z.string().min(1, 'يرجى اختيار الأسرة المستفيدة.'),
  monthlyAmount: z.union([z.string(), z.number()]),
  startMonthKey: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة شهر البدء يجب أن تكون YYYY-MM.'),
  fundType: z
    .enum(['zakat_mal', 'zakat_fitr', 'sadaqah', 'general', 'project_restricted'])
    .optional()
    .default('sadaqah'),
  notes: z.string().trim().max(400).optional().default(''),
});

const updatePensionSchema = z.object({
  monthlyAmount: z.union([z.string(), z.number()]).optional(),
  status: z.enum(['active', 'paused', 'stopped']).optional(),
  fundType: z
    .enum(['zakat_mal', 'zakat_fitr', 'sadaqah', 'general', 'project_restricted'])
    .optional(),
  notes: z.string().trim().max(400).optional(),
});

const disburseAssistanceSchema = z.object({
  familyId: z.string().min(1, 'يرجى اختيار الأسرة المستفيدة.'),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة الشهر يجب أن تكون YYYY-MM.'),
  amount: z.union([z.string(), z.number()]).optional(),
  proofReference: z.string().trim().max(180).optional().default(''),
  treasuryAccountId: z.string().nullable().optional(),
  fundType: z
    .enum(['zakat_mal', 'zakat_fitr', 'sadaqah', 'general', 'project_restricted'])
    .optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

const createDonationSchema = z.object({
  donorName: z.string().trim().max(120).optional().default(''),
  donorPhone: z.string().trim().max(30).optional().default(''),
  isAnonymous: z.boolean().optional().default(false),
  category: z.enum([
    'monthly_subscription',
    'sadaqah',
    'zakat',
    'zakat_fitr',
    'general_donation',
    'campaign',
    'in_kind',
  ]),
  paymentMethod: z
    .enum(['cash', 'bank_transfer', 'wallet', 'instapay', 'in_kind'])
    .optional()
    .default('cash'),
  amount: z.union([z.string(), z.number()]).optional().default('0.00'),
  donationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'يرجى تحديد تاريخ تبرع صحيح.'),
  treasuryAccountId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  activityId: z.string().nullable().optional(),
  inKindDescription: z.string().trim().max(300).optional().default(''),
  notes: z.string().trim().max(400).optional().default(''),
  warehouseInbound: z
    .object({
      itemName: z.string().trim().min(2),
      category: z.enum([
        'clothing',
        'electrical_appliances',
        'medical_devices',
        'food_supplies',
        'furniture',
        'other',
      ]),
      condition: z.enum(['new', 'used_good', 'needs_repair']).default('new'),
      quantity: z.coerce.number().int().min(1),
      unit: z.string().trim().min(1).default('قطعة'),
    })
    .optional(),
});

const createTreasuryAccountSchema = z.object({
  name: z.string().trim().min(3, 'اسم الخزينة أو الحساب يجب أن يكون ٣ أحرف على الأقل.'),
  accountType: z.enum(['cash_vault', 'bank_account']),
  bankName: z.string().trim().max(100).optional().default(''),
  accountNumberMasked: z.string().trim().max(40).optional().default(''),
  openingBalance: z.union([z.string(), z.number()]).optional().default('0.00'),
});

const createFinancialTxSchema = z.object({
  txType: z.enum(['expense', 'aid_disbursement', 'transfer']),
  title: z.string().trim().min(3, 'عنوان القيد المالي يجب أن يكون ٣ أحرف على الأقل.'),
  description: z.string().trim().max(600).optional().default(''),
  amount: z.union([z.string(), z.number()]),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ العملية غير صالح.'),
  fundType: z.enum(['zakat_mal', 'zakat_fitr', 'sadaqah', 'general', 'project_restricted']),
  purposeCategory: z.enum([
    'zakat_beneficiaries',
    'zakat_fitr_beneficiaries',
    'charity_aid',
    'project_expense',
    'medical_aid',
    'marriage_aid',
    'debt_relief',
    'food_aid',
    'administrative',
    'account_transfer',
  ]),
  sourceAccountId: z.string().min(1, 'يرجى تحديد الخزينة أو الحساب المصدر.'),
  destinationAccountId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  familyId: z.string().nullable().optional(),
});

const createProjectSchema = z.object({
  name: z.string().trim().min(3, 'اسم المشروع يجب أن يكون ٣ أحرف على الأقل.'),
  category: z.enum([
    'charity_pensions',
    'marriage_aid',
    'medical_aid',
    'debt_relief',
    'food_aid',
    'clothing_initiative',
    'medical_devices',
    'in_kind_program',
    'other_project',
  ]),
  description: z.string().trim().min(4, 'يرجى كتابة وصف مختصر للمشروع.'),
  budget: z.union([z.string(), z.number()]).default('0.00'),
  status: z.enum(['active', 'planned', 'completed', 'paused']).optional().default('active'),
  beneficiaryFamilyIds: z.array(z.string()).optional().default([]),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(3).optional(),
  description: z.string().trim().min(4).optional(),
  budget: z.union([z.string(), z.number()]).optional(),
  status: z.enum(['active', 'planned', 'completed', 'paused']).optional(),
  completionPercent: z.coerce.number().int().min(0).max(100).optional(),
  beneficiaryFamilyIds: z.array(z.string()).optional(),
  finalReport: z.string().trim().max(2500).optional(),
});

const createWarehouseItemSchema = z.object({
  name: z.string().trim().min(2, 'يرجى إدخال اسم الصنف العيني.'),
  category: z.enum([
    'clothing',
    'electrical_appliances',
    'medical_devices',
    'food_supplies',
    'furniture',
    'other',
  ]),
  condition: z.enum(['new', 'used_good', 'needs_repair']).default('new'),
  unit: z.string().trim().min(1).max(30).default('قطعة'),
  initialQty: z.coerce.number().int().min(0).max(100000).default(0),
  minStockAlert: z.coerce.number().int().min(0).max(10000).default(3),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  donationSource: z.string().trim().max(150).optional().default('تبرع عيني'),
  notes: z.string().trim().max(400).optional().default(''),
});

const createWarehouseMovementSchema = z.object({
  itemId: z.string().min(1, 'يرجى اختيار الصنف المخزني.'),
  movementType: z.enum(['in', 'out']),
  quantity: z.coerce.number().int().min(1, 'الكمية يجب أن تكون ١ على الأقل.'),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceOrBeneficiary: z.string().trim().max(160).optional().default(''),
  beneficiaryFamilyId: z.string().nullable().optional(),
  notes: z.string().trim().max(400).optional().default(''),
});

const createVolunteerSchema = z.object({
  fullName: z.string().trim().min(3, 'اسم المتطوع يجب أن يكون ٣ أحرف على الأقل.'),
  phone: z.string().trim().min(6, 'يرجى إدخال رقم هاتف صحيح.').max(30),
  address: z.string().trim().max(220).optional().default(''),
  skills: z.array(z.string().trim().min(1)).optional().default([]),
  teamName: z.string().trim().max(100).optional().default('فريق الخير الميداني'),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateVolunteerSchema = z.object({
  fullName: z.string().trim().min(3).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  address: z.string().trim().max(220).optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
  teamName: z.string().trim().max(100).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  evaluationNotes: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  nameAr: z.string().trim().min(2).max(120).optional(),
  sloganAr: z.string().trim().max(180).optional(),
  secondarySloganAr: z.string().trim().max(180).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  receiptPrefix: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z0-9_-]+$/, 'بادئة الإيصال يجب أن تحتوي على أحرف إنجليزية أو أرقام فقط.')
    .optional(),
  receiptFooterAr: z.string().trim().max(260).optional(),
  authorizedSignerName: z.string().trim().max(120).optional(),
  customDonationTypes: z.array(z.string().trim().min(2)).optional(),
  customExpenseTypes: z.array(z.string().trim().min(2)).optional(),
  customAidTypes: z.array(z.string().trim().min(2)).optional(),
  logoUpload: uploadDocumentSchema.optional(),
  resetLogoToDefault: z.boolean().optional(),
});

// =============================================================================
// HELPER COMPUTATIONS
// =============================================================================

function computeProjectsWithMetrics(state: AuthDatabaseState): CharityProjectWithMetrics[] {
  return state.projects.map((p) => {
    const donP = state.donations
      .filter((d) => d.projectId === p.id && d.category !== 'in_kind')
      .reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
    const expP = state.financialTransactions
      .filter(
        (t) =>
          t.projectId === p.id &&
          t.workflowStatus === 'executed' &&
          (t.txType === 'expense' || t.txType === 'aid_disbursement'),
      )
      .reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n);
    return {
      ...p,
      totalDonations: formatPiastersToDecimal(donP),
      totalExpenses: formatPiastersToDecimal(expP),
      remainingBalance: formatPiastersToDecimal(donP - expP),
      beneficiariesCount: p.beneficiaryFamilyIds.length,
    };
  });
}

function getScopedFamilies(state: AuthDatabaseState): StoredBeneficiaryFamilyRecord[] {
  return state.families;
}

// =============================================================================
// 1. BENEFICIARY FAMILIES MODULE (/api/families)
// =============================================================================

charityApiRouter.get(
  '/families',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canViewData', 'عرض البيانات'),
  (req: AuthedRequest, res) => {
    const state = readAuthStore();
    let scopedFamilies = getScopedFamilies(state);

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const eligibility = typeof req.query.eligibility === 'string' ? req.query.eligibility : '';
    const approval = typeof req.query.approval === 'string' ? req.query.approval : '';

    if (search) {
      scopedFamilies = scopedFamilies.filter(
        (f) =>
          f.headOfHousehold.toLowerCase().includes(search) ||
          f.fileNumber.toLowerCase().includes(search) ||
          f.phone.toLowerCase().includes(search) ||
          f.governorate.toLowerCase().includes(search),
      );
    }
    if (eligibility && eligibility !== 'all') {
      scopedFamilies = scopedFamilies.filter((f) => f.eligibilityStatus === eligibility);
    }
    if (approval && approval !== 'all') {
      scopedFamilies = scopedFamilies.filter((f) => f.approvalStatus === approval);
    }

    res.json({
      families: scopedFamilies.map(toPublicFamily),
      disbursements: state.monthlyDisbursements,
      activities: state.activities,
    });
  },
);

charityApiRouter.post(
  '/families',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createFamilySchema.parse(req.body);
      const user = req.currentUser!;
      const perms = req.permissions!;
      const state = readAuthStore();

      const targetActivityId: string | null = parsed.activityId ?? null;

      const cleanNationalId = parsed.nationalId.trim();
      if (cleanNationalId) {
        const nidHash = hashSensitiveText(cleanNationalId);
        const dup = state.families.find((f) => f.nationalIdHash && f.nationalIdHash === nidHash);
        if (dup) {
          res.status(409).json({
            error: `الرقم القومي مسجل بالفعل لملف الأسرة (${dup.fileNumber} — ${dup.headOfHousehold}). يُمنع تكرار تسجيل الأسرة.`,
          });
          return;
        }
      }

      const activity = targetActivityId
        ? state.activities.find((a) => a.id === targetActivityId) || null
        : null;

      const normalizedAmount = parsed.monthlyAssistanceEnabled
        ? normalizePositiveMoney(parsed.monthlyAssistanceAmount)
        : normalizeNonNegativeMoney(parsed.monthlyAssistanceAmount || '0.00');

      const approvalStatus =
        parsed.approvalStatus && perms.canApproveTransactions
          ? parsed.approvalStatus
          : parsed.eligibilityStatus === 'priority' || parsed.eligibilityStatus === 'eligible'
            ? perms.canApproveTransactions
              ? 'approved'
              : 'pending_review'
            : 'pending_review';

      const now = new Date().toISOString();
      const newFamily: StoredBeneficiaryFamilyRecord = {
        id: crypto.randomUUID(),
        fileNumber: generateFamilyFileNumber(state),
        headOfHousehold: parsed.headOfHousehold,
        nationalIdMasked: 'غير مسجل',
        hasNationalId: false,
        governorate: parsed.governorate,
        address: parsed.address,
        phone: parsed.phone,
        membersCount: parsed.membersCount,
        maritalStatus: parsed.maritalStatus,
        economicStatus: parsed.economicStatus,
        incomeSource: parsed.incomeSource,
        eligibilityStatus: parsed.eligibilityStatus,
        approvalStatus,
        socialResearchResult: '',
        socialResearchDate: null,
        socialResearchByName: null,
        supportType: parsed.supportType,
        monthlyAssistanceEnabled: parsed.monthlyAssistanceEnabled,
        monthlyAssistanceAmount: normalizedAmount,
        activityId: activity ? activity.id : null,
        activityName: activity ? activity.name : null,
        notes: parsed.notes,
        attachments: [],
        createdBy: user.id,
        createdByName: user.fullName,
        createdAt: now,
        updatedAt: now,
      };

      if (cleanNationalId) {
        applyNationalIdProtection(newFamily, cleanNationalId);
      }

      state.families.unshift(newFamily);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FAMILY_REGISTERED',
        summaryAr: `تسجيل ملف أسرة مستفيدة جديدة (${newFamily.fileNumber} — ${newFamily.headOfHousehold}) بعدد ${newFamily.membersCount} أفراد.`,
      });
      writeAuthStore(state);
      res.status(201).json({family: toPublicFamily(newFamily)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.patch(
  '/families/:id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = updateFamilySchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const family = state.families.find((f) => f.id === req.params.id);
      if (!family) {
        res.status(404).json({error: 'ملف الأسرة غير موجود.'});
        return;
      }

      if (parsed.nationalId !== undefined && parsed.nationalId.trim()) {
        const nidHash = hashSensitiveText(parsed.nationalId.trim());
        const dup = state.families.find(
          (f) => f.id !== family.id && f.nationalIdHash && f.nationalIdHash === nidHash,
        );
        if (dup) {
          res.status(409).json({
            error: `الرقم القومي مسجل بالفعل لملف الأسرة (${dup.fileNumber}).`,
          });
          return;
        }
        applyNationalIdProtection(family, parsed.nationalId.trim());
      }

      if (parsed.headOfHousehold !== undefined) family.headOfHousehold = parsed.headOfHousehold;
      if (parsed.governorate !== undefined) family.governorate = parsed.governorate;
      if (parsed.address !== undefined) family.address = parsed.address;
      if (parsed.phone !== undefined) family.phone = parsed.phone;
      if (parsed.membersCount !== undefined) family.membersCount = parsed.membersCount;
      if (parsed.maritalStatus !== undefined) family.maritalStatus = parsed.maritalStatus;
      if (parsed.economicStatus !== undefined) family.economicStatus = parsed.economicStatus;
      if (parsed.incomeSource !== undefined) family.incomeSource = parsed.incomeSource;
      if (parsed.eligibilityStatus !== undefined) family.eligibilityStatus = parsed.eligibilityStatus;
      if (parsed.supportType !== undefined) family.supportType = parsed.supportType;
      if (parsed.monthlyAssistanceEnabled !== undefined) {
        family.monthlyAssistanceEnabled = parsed.monthlyAssistanceEnabled;
      }
      if (parsed.monthlyAssistanceAmount !== undefined) {
        family.monthlyAssistanceAmount = family.monthlyAssistanceEnabled
          ? normalizePositiveMoney(parsed.monthlyAssistanceAmount)
          : normalizeNonNegativeMoney(parsed.monthlyAssistanceAmount);
      }
      if (parsed.activityId !== undefined) {
        const act = parsed.activityId
          ? state.activities.find((a) => a.id === parsed.activityId) || null
          : null;
        family.activityId = act ? act.id : null;
        family.activityName = act ? act.name : null;
      }
      if (parsed.notes !== undefined) family.notes = parsed.notes;
      family.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FAMILY_UPDATED',
        summaryAr: `تحديث بيانات ملف الأسرة (${family.fileNumber} — ${family.headOfHousehold}).`,
      });
      writeAuthStore(state);
      res.json({family: toPublicFamily(family)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.delete(
  '/families/:id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canDeleteData', 'حذف / تصحيح البيانات'),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const idx = state.families.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'ملف الأسرة غير موجود.'});
      return;
    }
    const family = state.families[idx];

    // Financial integrity safeguard: do not delete families with recorded disbursement/transaction history
    const hasHistory =
      state.monthlyDisbursements.some((d) => d.familyId === family.id) ||
      state.financialTransactions.some((t) => t.familyId === family.id) ||
      state.pensionPlans.some((p) => p.familyId === family.id);

    if (hasHistory) {
      res.status(409).json({
        error:
          'لا يجوز حذف ملف أسرة لها سجل صرف أو خطة معاش حفاظاً على سلامة التدقيق المالي. يمكنك تغيير حالتها إلى «موقوفة مؤقتاً» بدلاً من الحذف.',
      });
      return;
    }

    state.families.splice(idx, 1);
    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'FAMILY_DELETED',
      summaryAr: `حذف ملف الأسرة (${family.fileNumber} — ${family.headOfHousehold}) لعدم وجود معاملات مالية مرتبطة.`,
    });
    writeAuthStore(state);
    res.json({success: true});
  },
);

charityApiRouter.get(
  '/families/:id/national-id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canViewData', 'عرض البيانات'),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const family = state.families.find((f) => f.id === req.params.id);
    if (!family) {
      res.status(404).json({error: 'ملف الأسرة غير موجود.'});
      return;
    }
    if (!family.nationalIdEncrypted) {
      res.status(404).json({error: 'لا يوجد رقم قومي مشفّر مسجل لهذا الملف.'});
      return;
    }
    const plain = decryptSensitiveText(family.nationalIdEncrypted);
    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'NATIONAL_ID_ACCESSED',
      summaryAr: `كشف مصرح به للرقم القومي المشفّر لملف الأسرة (${family.fileNumber} — ${family.headOfHousehold}).`,
    });
    writeAuthStore(state);
    res.json({nationalId: plain});
  },
);

charityApiRouter.post(
  '/families/:id/social-research',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canApproveTransactions', 'اعتماد المعاملات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = socialResearchSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const family = state.families.find((f) => f.id === req.params.id);
      if (!family) {
        res.status(404).json({error: 'ملف الأسرة غير موجود.'});
        return;
      }

      const now = new Date().toISOString();
      family.socialResearchResult = parsed.socialResearchResult;
      family.approvalStatus = parsed.approvalStatus;
      family.socialResearchDate = now;
      family.socialResearchByName = user.fullName;
      if (parsed.eligibilityStatus) {
        family.eligibilityStatus = parsed.eligibilityStatus;
      } else if (parsed.approvalStatus === 'approved' && family.eligibilityStatus === 'pending_review') {
        family.eligibilityStatus = 'eligible';
      } else if (parsed.approvalStatus === 'rejected') {
        family.eligibilityStatus = 'suspended';
        family.monthlyAssistanceEnabled = false;
      }
      family.updatedAt = now;

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FAMILY_SOCIAL_RESEARCH',
        summaryAr: `اعتماد نتيجة البحث الاجتماعي لملف الأسرة (${family.fileNumber}) — القرار: ${FAMILY_APPROVAL_LABELS_AR[family.approvalStatus]}.`,
      });
      writeAuthStore(state);
      res.json({family: toPublicFamily(family)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.get(
  '/families/:id/history',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canViewData', 'عرض البيانات'),
  (req: AuthedRequest, res) => {
    const state = readAuthStore();
    const family = state.families.find((f) => f.id === req.params.id);
    if (!family) {
      res.status(404).json({error: 'ملف الأسرة غير موجود.'});
      return;
    }

    const history: FamilyAssistanceHistory = {
      family: toPublicFamily(family),
      pensionPlans: state.pensionPlans.filter((p) => p.familyId === family.id),
      pensionDisbursements: state.monthlyDisbursements.filter((d) => d.familyId === family.id),
      financialAidTransactions: state.financialTransactions.filter((t) => t.familyId === family.id),
      warehouseDistributions: state.warehouseMovements.filter(
        (m) => m.beneficiaryFamilyId === family.id && m.movementType === 'out',
      ),
    };
    res.json(history);
  },
);

charityApiRouter.post(
  '/families/:id/attachments',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('families', 'الأسر المستفيدة'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = uploadDocumentSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const family = state.families.find((f) => f.id === req.params.id);
      if (!family) {
        res.status(404).json({error: 'ملف الأسرة غير موجود.'});
        return;
      }

      const docRef = savePrivateDocument({
        state,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        base64Data: parsed.base64Data,
        entityType: 'family',
        entityId: family.id,
        uploadedBy: user.id,
        uploadedByName: user.fullName,
      });

      family.attachments = [docRef, ...(family.attachments || [])];
      family.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FAMILY_DOCUMENT_UPLOADED',
        summaryAr: `إرفاق مستند محمي (${docRef.fileName}) لملف الأسرة (${family.fileNumber}).`,
      });
      writeAuthStore(state);
      res.status(201).json({document: docRef, family: toPublicFamily(family)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 2. CHARITY PENSIONS MODULE (/api/pensions & /api/assistance/disbursements)
// =============================================================================

charityApiRouter.get(
  '/pensions',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('pensions', 'نظام معاشات الخير الشهرية'),
  requireGranular('canViewData', 'عرض البيانات'),
  (req: AuthedRequest, res) => {
    const state = readAuthStore();
    const currentMonthKey = getCurrentMonthKey();
    const requestedMonth =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : currentMonthKey;

    const scopedPlans = state.pensionPlans;

    let monthlyTotalP = 0n;
    let paidForMonthTotalP = 0n;
    let paidForMonthCount = 0;
    let totalArrearsP = 0n;
    let arrearsPlansCount = 0;

    const rows: PensionMonthRow[] = scopedPlans.map((plan) => {
      const paidDisbursement =
        state.monthlyDisbursements.find(
          (d) => d.familyId === plan.familyId && d.monthKey === requestedMonth,
        ) || null;

      if (paidDisbursement) {
        paidForMonthCount += 1;
        paidForMonthTotalP += parseMoneyToPiasters(paidDisbursement.amount);
      }

      let arrearsMonthKeys: string[] = [];
      let arrearsTotalP = 0n;

      if (plan.status === 'active') {
        monthlyTotalP += parseMoneyToPiasters(plan.monthlyAmount);
        const expectedMonths = listMonthKeysRange(plan.startMonthKey, currentMonthKey);
        const paidSet = new Set(
          state.monthlyDisbursements
            .filter((d) => d.familyId === plan.familyId)
            .map((d) => d.monthKey),
        );
        arrearsMonthKeys = expectedMonths.filter((mk) => !paidSet.has(mk));
        arrearsTotalP = BigInt(arrearsMonthKeys.length) * parseMoneyToPiasters(plan.monthlyAmount);
        if (arrearsMonthKeys.length > 0) {
          arrearsPlansCount += 1;
          totalArrearsP += arrearsTotalP;
        }
      }

      return {
        plan,
        monthKey: requestedMonth,
        paidDisbursement,
        arrearsMonthKeys,
        arrearsTotal: formatPiastersToDecimal(arrearsTotalP),
      };
    });

    const eligibleFamilies = getScopedFamilies(state)
      .filter((f) => f.eligibilityStatus !== 'suspended')
      .map(toPublicFamily);

    res.json({
      monthKey: requestedMonth,
      currentMonthKey,
      rows,
      summary: {
        activeCount: scopedPlans.filter((p) => p.status === 'active').length,
        pausedCount: scopedPlans.filter((p) => p.status === 'paused').length,
        stoppedCount: scopedPlans.filter((p) => p.status === 'stopped').length,
        monthlyTotal: formatPiastersToDecimal(monthlyTotalP),
        annualTotal: formatPiastersToDecimal(monthlyTotalP * 12n),
        paidForMonthTotal: formatPiastersToDecimal(paidForMonthTotalP),
        paidForMonthCount,
        totalArrearsAmount: formatPiastersToDecimal(totalArrearsP),
        arrearsPlansCount,
      },
      eligibleFamilies,
      treasuryAccounts: state.treasuryAccounts.filter((a) => a.isActive),
    });
  },
);

charityApiRouter.post(
  '/pensions',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createPensionSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const family = state.families.find((f) => f.id === parsed.familyId);
      if (!family) {
        res.status(404).json({error: 'ملف الأسرة غير موجود.'});
        return;
      }
      if (family.approvalStatus === 'rejected') {
        res.status(400).json({error: 'لا يمكن إدراج أسرة مرفوضة في نظام معاشات الخير.'});
        return;
      }

      const existingActive = state.pensionPlans.find(
        (p) => p.familyId === family.id && p.status !== 'stopped',
      );
      if (existingActive) {
        res.status(409).json({
          error: `توجد بالفعل خطة معاش سارية أو موقوفة مؤقتاً لهذه الأسرة (${family.fileNumber}). يمكنك تعديل الخطة القائمة بدلاً من التكرار.`,
        });
        return;
      }

      assertFundPurposeCompatibility(parsed.fundType, 'charity_aid', null);
      const normalizedAmount = normalizePositiveMoney(parsed.monthlyAmount);
      const now = new Date().toISOString();

      const plan: CharityPensionPlan = {
        id: crypto.randomUUID(),
        familyId: family.id,
        familyFileNumber: family.fileNumber,
        headOfHousehold: family.headOfHousehold,
        activityId: family.activityId,
        monthlyAmount: normalizedAmount,
        startMonthKey: parsed.startMonthKey,
        status: 'active',
        fundType: parsed.fundType,
        notes: parsed.notes,
        approvedBy: user.id,
        approvedByName: user.fullName,
        createdAt: now,
        updatedAt: now,
      };

      state.pensionPlans.unshift(plan);
      family.monthlyAssistanceEnabled = true;
      family.monthlyAssistanceAmount = normalizedAmount;
      family.supportType = 'monthly_pension';
      family.updatedAt = now;

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PENSION_PLAN_CREATED',
        summaryAr: `اعتماد رئيس مجلس الإدارة لخطة معاش خير شهري للأسرة (${family.fileNumber} — ${family.headOfHousehold}) بقيمة ${normalizedAmount} ج.م اعتباراً من ${plan.startMonthKey}.`,
      });
      writeAuthStore(state);
      res.status(201).json({plan});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.patch(
  '/pensions/:id',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const parsed = updatePensionSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const plan = state.pensionPlans.find((p) => p.id === req.params.id);
      if (!plan) {
        res.status(404).json({error: 'خطة المعاش غير موجودة.'});
        return;
      }

      if (parsed.fundType !== undefined) {
        assertFundPurposeCompatibility(parsed.fundType, 'charity_aid', null);
        plan.fundType = parsed.fundType;
      }
      if (parsed.monthlyAmount !== undefined) {
        plan.monthlyAmount = normalizePositiveMoney(parsed.monthlyAmount);
      }
      if (parsed.status !== undefined) {
        plan.status = parsed.status;
      }
      if (parsed.notes !== undefined) {
        plan.notes = parsed.notes;
      }
      plan.approvedBy = user.id;
      plan.approvedByName = user.fullName;
      plan.updatedAt = new Date().toISOString();

      const family = state.families.find((f) => f.id === plan.familyId);
      if (family) {
        family.monthlyAssistanceEnabled = plan.status === 'active';
        family.monthlyAssistanceAmount = plan.monthlyAmount;
        family.updatedAt = plan.updatedAt;
      }

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PENSION_PLAN_UPDATED',
        summaryAr: `اعتماد رئيس مجلس الإدارة لتعديل معاش الأسرة (${plan.familyFileNumber}) — القيمة: ${plan.monthlyAmount} ج.م · الحالة: ${PENSION_STATUS_LABELS_AR[plan.status]}.`,
      });
      writeAuthStore(state);
      res.json({plan});
    } catch (err) {
      sendError(res, err);
    }
  },
);

function handleMonthlyDisbursement(req: AuthedRequest, res: UniversalResponse) {
  try {
    const parsed = disburseAssistanceSchema.parse(req.body);
    const user = req.currentUser!;
    const perms = req.permissions!;
    if (user.role !== 'president' && !perms.canExecuteFinancial) {
      res.status(403).json({
        error: 'مرفوض أمنياً: لا تملك صلاحية تنفيذ المعاملات المالية وصرف المعاشات الشهرية.',
      });
      return;
    }

    const state = readAuthStore();
    const family = state.families.find((f) => f.id === parsed.familyId);
    if (!family) {
      res.status(404).json({error: 'ملف الأسرة غير موجود.'});
      return;
    }

    const existing = state.monthlyDisbursements.find(
      (d) => d.familyId === family.id && d.monthKey === parsed.monthKey,
    );
    if (existing) {
      res.status(409).json({
        error: `منع تكرار الصرف: تم صرف المعاش / المساعدة الشهرية بالفعل لهذه الأسرة (${family.fileNumber}) عن شهر ${parsed.monthKey}.`,
      });
      return;
    }

    // Strict governance: monthly pension disbursement MUST be backed by an active President-approved pension plan
    const activePlan = state.pensionPlans.find(
      (p) => p.familyId === family.id && p.status === 'active',
    );
    const planApprover = activePlan
      ? state.users.find((u) => u.id === activePlan.approvedBy)
      : null;
    if (!activePlan || !planApprover || planApprover.role !== 'president') {
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PRESIDENT_APPROVAL_BYPASS_BLOCKED',
        summaryAr: `منع خادمي لمحاولة صرف معاش شهري للأسرة (${family.fileNumber}) دون خطة معاش سارية ومعتمدة من رئيس مجلس الإدارة.`,
      });
      writeAuthStore(state);
      res.status(403).json({
        error:
          'مرفوض أمنياً: لا يجوز صرف معاش شهري إلا بناءً على خطة معاش سارية ومعتمدة من رئيس مجلس الإدارة.',
      });
      return;
    }

    if (
      parsed.amount !== undefined &&
      normalizePositiveMoney(parsed.amount) !== activePlan.monthlyAmount
    ) {
      res.status(403).json({
        error:
          'مرفوض أمنياً: لا يجوز تعديل قيمة المعاش الشهري المعتمد من رئيس مجلس الإدارة عند الصرف.',
      });
      return;
    }
    if (parsed.fundType !== undefined && parsed.fundType !== activePlan.fundType) {
      res.status(403).json({
        error:
          'مرفوض أمنياً: لا يجوز تغيير الصندوق المموّل للمعاش عن الصندوق المعتمد من رئيس مجلس الإدارة.',
      });
      return;
    }

    const normalizedAmount = activePlan.monthlyAmount;
    const fundType: FundPoolType = activePlan.fundType;

    assertFundPurposeCompatibility(fundType, 'charity_aid', null);

    let treasuryAccountId: string | null = parsed.treasuryAccountId ?? null;
    if (treasuryAccountId) {
      const account = state.treasuryAccounts.find((a) => a.id === treasuryAccountId && a.isActive);
      if (!account) {
        res.status(404).json({error: 'الخزينة أو الحساب البنكي المحدد غير موجود أو غير نشط.'});
        return;
      }
      debitTreasuryAccount(account, fundType, normalizedAmount);
    } else {
      treasuryAccountId = null;
    }

    const disbursement: MonthlyAssistanceDisbursement = {
      id: crypto.randomUUID(),
      familyId: family.id,
      familyFileNumber: family.fileNumber,
      headOfHousehold: family.headOfHousehold,
      activityId: family.activityId,
      monthKey: parsed.monthKey,
      amount: normalizedAmount,
      supportType: family.supportType,
      proofReference: parsed.proofReference,
      treasuryAccountId,
      fundType,
      notes: parsed.notes,
      recordedBy: user.id,
      recordedByName: user.fullName,
      recordedAt: new Date().toISOString(),
    };

    state.monthlyDisbursements.unshift(disbursement);
    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'MONTHLY_ASSISTANCE_DISBURSED',
      summaryAr: `صرف معاش شهري معتمد (${disbursement.monthKey}) لملف الأسرة (${family.fileNumber} — ${family.headOfHousehold}) بقيمة ${disbursement.amount} ج.م من ${FUND_POOL_LABELS_AR[fundType]}.`,
    });
    writeAuthStore(state);
    res.status(201).json({disbursement});
  } catch (err) {
    sendError(res, err);
  }
}

charityApiRouter.post(
  '/pensions/disburse',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('pensions', 'نظام معاشات الخير الشهرية'),
  requireGranular('canExecuteFinancial', 'تنفيذ المعاملات المالية والصرف'),
  handleMonthlyDisbursement,
);

charityApiRouter.post(
  '/assistance/disbursements',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('pensions', 'نظام معاشات الخير الشهرية'),
  requireGranular('canExecuteFinancial', 'تنفيذ المعاملات المالية والصرف'),
  handleMonthlyDisbursement,
);

// =============================================================================
// 3. DONATIONS & DONORS MODULE (/api/donations)
// =============================================================================

charityApiRouter.get(
  '/donations',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('donations', 'التبرعات وسجل المتبرعين'),
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    const donations = state.donations;

    // Build live donor directory from real donations
    const donorMap = new Map<
      string,
      {
        donorKey: string;
        donorName: string;
        donorPhone: string;
        isAnonymous: boolean;
        donationsCount: number;
        totalMonetaryPiasters: bigint;
        inKindCount: number;
        lastDonationDate: string;
      }
    >();

    for (const d of donations) {
      const key = d.isAnonymous ? '__anonymous__' : d.donorName.trim().toLowerCase();
      const existing = donorMap.get(key) || {
        donorKey: key,
        donorName: d.donorName,
        donorPhone: d.donorPhone || '',
        isAnonymous: d.isAnonymous,
        donationsCount: 0,
        totalMonetaryPiasters: 0n,
        inKindCount: 0,
        lastDonationDate: d.donationDate,
      };
      existing.donationsCount += 1;
      if (d.category === 'in_kind') {
        existing.inKindCount += 1;
      } else {
        existing.totalMonetaryPiasters += parseMoneyToPiasters(d.amount);
      }
      if (!existing.donorPhone && d.donorPhone) existing.donorPhone = d.donorPhone;
      if (d.donationDate > existing.lastDonationDate) existing.lastDonationDate = d.donationDate;
      donorMap.set(key, existing);
    }

    const donors = Array.from(donorMap.values())
      .map((item) => ({
        donorName: item.donorName,
        donorPhone: item.donorPhone,
        isAnonymous: item.isAnonymous,
        donationsCount: item.donationsCount,
        totalMonetary: formatPiastersToDecimal(item.totalMonetaryPiasters),
        inKindCount: item.inKindCount,
        lastDonationDate: item.lastDonationDate,
      }))
      .sort((a, b) => (a.lastDonationDate < b.lastDonationDate ? 1 : -1));

    res.json({
      donations,
      donors,
      treasuryAccounts: state.treasuryAccounts.filter((a) => a.isActive),
      projects: state.projects.map((p) => ({id: p.id, code: p.code, name: p.name})),
      activities: state.activities,
      organizationSettings: state.organizationSettings,
    });
  },
);

charityApiRouter.post(
  '/donations',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('donations', 'التبرعات وسجل المتبرعين'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createDonationSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();

      const targetActivityId: string | null = parsed.activityId ?? null;

      const activity = targetActivityId
        ? state.activities.find((a) => a.id === targetActivityId) || null
        : null;

      const project = parsed.projectId
        ? state.projects.find((p) => p.id === parsed.projectId) || null
        : null;

      const isInKind = parsed.category === 'in_kind';
      const normalizedAmount = isInKind
        ? normalizeNonNegativeMoney(parsed.amount || '0.00')
        : normalizePositiveMoney(parsed.amount);

      const fundType = mapDonationCategoryToFundPool(parsed.category, Boolean(project));
      let targetAccount: TreasuryAccount | null = null;

      if (!isInKind) {
        targetAccount = parsed.treasuryAccountId
          ? state.treasuryAccounts.find((a) => a.id === parsed.treasuryAccountId && a.isActive) ||
            null
          : state.treasuryAccounts.find((a) => a.isActive) || null;

        if (!targetAccount) {
          res.status(400).json({error: 'لا توجد خزينة أو حساب بنكي نشط لاستقبال التبرع.'});
          return;
        }
        creditTreasuryAccount(targetAccount, fundType, normalizedAmount);
      }

      const resolvedDonorName =
        parsed.isAnonymous || !parsed.donorName.trim()
          ? 'متبرع فاعل خير'
          : parsed.donorName.trim();

      const now = new Date().toISOString();
      const donation: DonationRecord = {
        id: crypto.randomUUID(),
        receiptNumber: generateDonationReceiptNumber(state),
        donorName: resolvedDonorName,
        donorPhone: parsed.isAnonymous ? '' : parsed.donorPhone.trim(),
        isAnonymous: parsed.isAnonymous || !parsed.donorName.trim(),
        category: parsed.category,
        fundType,
        paymentMethod: isInKind ? 'in_kind' : parsed.paymentMethod,
        amount: normalizedAmount,
        donationDate: parsed.donationDate,
        monthKey: parsed.donationDate.slice(0, 7),
        treasuryAccountId: targetAccount ? targetAccount.id : null,
        treasuryAccountName: targetAccount ? targetAccount.name : null,
        projectId: project ? project.id : null,
        projectName: project ? project.name : null,
        activityId: activity ? activity.id : null,
        activityName: activity ? activity.name : null,
        inKindDescription: parsed.inKindDescription,
        notes: parsed.notes,
        recordedBy: user.id,
        recordedByName: user.fullName,
        recordedAt: now,
      };

      // Optional automatic warehouse receipt for in-kind donations
      if (isInKind && parsed.warehouseInbound) {
        const wh = parsed.warehouseInbound;
        const item: WarehouseItem = {
          id: crypto.randomUUID(),
          itemCode: generateWarehouseCode(state),
          name: wh.itemName,
          category: wh.category,
          condition: wh.condition,
          unit: wh.unit,
          minStockAlert: 2,
          totalIn: wh.quantity,
          totalOut: 0,
          availableQty: wh.quantity,
          receivedDate: parsed.donationDate,
          donationSource: `${resolvedDonorName} (إيصال ${donation.receiptNumber})`,
          notes: parsed.inKindDescription || parsed.notes,
          createdBy: user.id,
          createdByName: user.fullName,
          createdAt: now,
          updatedAt: now,
        };
        const movement: WarehouseMovement = {
          id: crypto.randomUUID(),
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          movementType: 'in',
          quantity: wh.quantity,
          movementDate: parsed.donationDate,
          sourceOrBeneficiary: resolvedDonorName,
          beneficiaryFamilyId: null,
          beneficiaryFamilyName: null,
          notes: `استلام تبرع عيني تلقائياً — إيصال ${donation.receiptNumber}`,
          recordedBy: user.id,
          recordedByName: user.fullName,
          recordedAt: now,
        };
        state.warehouseItems.unshift(item);
        state.warehouseMovements.unshift(movement);
      }

      state.donations.unshift(donation);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'DONATION_RECORDED',
        summaryAr: `تسجيل تبرع (${DONATION_CATEGORY_LABELS_AR[donation.category]}) بإيصال رقم ${donation.receiptNumber} بقيمة ${donation.amount} ج.م${targetAccount ? ` إلى (${targetAccount.name} — ${FUND_POOL_LABELS_AR[fundType]})` : ' (تبرع عيني)'}.`,
      });
      writeAuthStore(state);
      res.status(201).json({donation});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 4. FINANCE, TREASURY & 3-STEP SEGREGATION OF DUTIES (/api/finance)
// =============================================================================

charityApiRouter.get(
  '/finance/overview',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('finance', 'الإدارة المالية والخزينة'),
  (req: AuthedRequest, res) => {
    const perms = req.permissions!;
    if (!perms.canViewTreasury) {
      res.status(403).json({error: 'مرفوض أمنياً: لا تملك صلاحية الاطلاع على الخزينة والإدارة المالية.'});
      return;
    }

    const state = readAuthStore();
    const fundTotalsP: Record<FundPoolType, bigint> = {
      zakat_mal: 0n,
      zakat_fitr: 0n,
      sadaqah: 0n,
      general: 0n,
      project_restricted: 0n,
    };
    let grandTotalP = 0n;

    for (const acc of state.treasuryAccounts) {
      grandTotalP += parseMoneyToPiasters(acc.currentBalance);
      (Object.keys(fundTotalsP) as FundPoolType[]).forEach((ft) => {
        fundTotalsP[ft] += parseMoneyToPiasters(acc.fundBalances[ft] || '0.00');
      });
    }

    const fundTotals: Record<FundPoolType, string> = {
      zakat_mal: formatPiastersToDecimal(fundTotalsP.zakat_mal),
      zakat_fitr: formatPiastersToDecimal(fundTotalsP.zakat_fitr),
      sadaqah: formatPiastersToDecimal(fundTotalsP.sadaqah),
      general: formatPiastersToDecimal(fundTotalsP.general),
      project_restricted: formatPiastersToDecimal(fundTotalsP.project_restricted),
    };

    res.json({
      accounts: state.treasuryAccounts,
      grandTotalBalance: formatPiastersToDecimal(grandTotalP),
      fundTotals,
      transactions: state.financialTransactions,
      projects: state.projects.map((p) => ({id: p.id, code: p.code, name: p.name})),
      families: state.families
        .filter((f) => f.eligibilityStatus !== 'suspended')
        .map((f) => ({id: f.id, fileNumber: f.fileNumber, headOfHousehold: f.headOfHousehold})),
    });
  },
);

charityApiRouter.post(
  '/finance/accounts',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createTreasuryAccountSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const opening = normalizeNonNegativeMoney(parsed.openingBalance);
      const now = new Date().toISOString();

      const fundBalances = createZeroFundBalances();
      fundBalances.general = opening;

      const account: TreasuryAccount = {
        id: crypto.randomUUID(),
        name: parsed.name,
        accountType: parsed.accountType,
        bankName: parsed.bankName,
        accountNumberMasked: parsed.accountNumberMasked,
        isActive: true,
        currentBalance: opening,
        fundBalances,
        createdAt: now,
        updatedAt: now,
      };

      state.treasuryAccounts.push(account);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'TREASURY_ACCOUNT_CREATED',
        summaryAr: `إنشاء حساب خزينة/بنك جديد (${account.name}) برصيد افتتاحي ${opening} ج.م.`,
      });
      writeAuthStore(state);
      res.status(201).json({account});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// Step 1: Record financial transaction (Maker)
charityApiRouter.post(
  '/finance/transactions',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('finance', 'الإدارة المالية والخزينة'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createFinancialTxSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();

      const sourceAcc = state.treasuryAccounts.find((a) => a.id === parsed.sourceAccountId && a.isActive);
      if (!sourceAcc) {
        res.status(404).json({error: 'الخزينة أو الحساب المصدر غير موجود أو غير نشط.'});
        return;
      }

      let destAcc: TreasuryAccount | null = null;
      if (parsed.txType === 'transfer') {
        if (!parsed.destinationAccountId || parsed.destinationAccountId === parsed.sourceAccountId) {
          res.status(400).json({error: 'يرجى تحديد حساب وجهة مختلف عن الحساب المصدر للتحويل.'});
          return;
        }
        destAcc =
          state.treasuryAccounts.find((a) => a.id === parsed.destinationAccountId && a.isActive) ||
          null;
        if (!destAcc) {
          res.status(404).json({error: 'الحساب المحوّل إليه غير موجود أو غير نشط.'});
          return;
        }
      }

      const purposeCategory =
        parsed.txType === 'transfer' ? 'account_transfer' : parsed.purposeCategory;

      // Enforce Sharia & Financial Governance Fund Segregation immediately
      assertFundPurposeCompatibility(parsed.fundType, purposeCategory, parsed.projectId ?? null);

      const normalizedAmount = normalizePositiveMoney(parsed.amount);
      const project = parsed.projectId
        ? state.projects.find((p) => p.id === parsed.projectId) || null
        : null;
      const family = parsed.familyId
        ? state.families.find((f) => f.id === parsed.familyId) || null
        : null;

      // Block duplicate identical active/executed payout to the same family on the same date & amount
      if (family && parsed.txType === 'aid_disbursement') {
        const dup = state.financialTransactions.find(
          (t) =>
            t.familyId === family.id &&
            t.txDate === parsed.txDate &&
            t.amount === normalizedAmount &&
            t.purposeCategory === purposeCategory &&
            t.workflowStatus !== 'rejected' &&
            t.workflowStatus !== 'reversed',
        );
        if (dup) {
          res.status(409).json({
            error: `منع تكرار الصرف: يوجد بالفعل قيد مساعدة مطابق (${dup.entryNumber}) لنفس الأسرة والمبلغ والتاريخ.`,
          });
          return;
        }
      }

      const now = new Date().toISOString();
      const tx: FinancialTransaction = {
        id: crypto.randomUUID(),
        entryNumber: generateFinancialEntryNumber(state),
        txType: parsed.txType,
        title: parsed.title,
        description: parsed.description,
        amount: normalizedAmount,
        txDate: parsed.txDate,
        monthKey: parsed.txDate.slice(0, 7),
        fundType: parsed.fundType,
        purposeCategory,
        sourceAccountId: sourceAcc.id,
        sourceAccountName: sourceAcc.name,
        destinationAccountId: destAcc ? destAcc.id : null,
        destinationAccountName: destAcc ? destAcc.name : null,
        projectId: project ? project.id : null,
        projectName: project ? project.name : null,
        familyId: family ? family.id : null,
        familyName: family ? `${family.headOfHousehold} (${family.fileNumber})` : null,
        workflowStatus: 'recorded',
        recordedBy: user.id,
        recordedByName: user.fullName,
        recordedAt: now,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        approvalNotes: '',
        executedBy: null,
        executedByName: null,
        executedAt: null,
        executionReference: '',
        reversedBy: null,
        reversedByName: null,
        reversedAt: null,
        reversalReason: '',
        reversesTransactionId: null,
      };

      state.financialTransactions.unshift(tx);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FINANCIAL_TX_RECORDED',
        summaryAr: `الخطوة ١ (تسجيل): تسجيل القيد المالي ${tx.entryNumber} (${tx.title}) بقيمة ${tx.amount} ج.م من ${FUND_POOL_LABELS_AR[tx.fundType]} — بانتظار الاعتماد من مستخدم آخر.`,
      });
      writeAuthStore(state);
      res.status(201).json({transaction: tx});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// Step 2a: Approve financial transaction (EXCLUSIVELY Chairman — cannot be bypassed by any Manager)
charityApiRouter.post(
  '/finance/transactions/:id/approve',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const tx = state.financialTransactions.find((t) => t.id === req.params.id);
    if (!tx) {
      res.status(404).json({error: 'القيد المالي غير موجود.'});
      return;
    }
    if (tx.workflowStatus !== 'recorded') {
      res.status(409).json({
        error: 'لا يمكن اعتماد هذا القيد لأنه لم يعد في مرحلة «مسجلة (بانتظار الاعتماد)».',
      });
      return;
    }

    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : '';
    tx.workflowStatus = 'approved';
    tx.approvedBy = user.id;
    tx.approvedByName = user.fullName;
    tx.approvedAt = new Date().toISOString();
    tx.approvalNotes = notes;

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'FINANCIAL_TX_APPROVED',
      summaryAr: `الخطوة ٢ (اعتماد رئيس مجلس الإدارة): اعتماد القيد المالي ${tx.entryNumber} (${tx.title}) بقيمة ${tx.amount} ج.م — بانتظار تنفيذ الصرف من مدير مفوّض.`,
    });
    writeAuthStore(state);
    res.json({transaction: tx});
  },
);

// Step 2b: Reject financial transaction (EXCLUSIVELY Chairman)
charityApiRouter.post(
  '/finance/transactions/:id/reject',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const tx = state.financialTransactions.find((t) => t.id === req.params.id);
    if (!tx) {
      res.status(404).json({error: 'القيد المالي غير موجود.'});
      return;
    }
    if (tx.workflowStatus !== 'recorded') {
      res.status(409).json({error: 'لا يمكن رفض قيد مالي بعد اعتماده أو تنفيذه.'});
      return;
    }

    const reason = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    if (reason.length < 3) {
      res.status(400).json({error: 'يرجى كتابة سبب رفض القيد المالي.'});
      return;
    }

    tx.workflowStatus = 'rejected';
    tx.approvedBy = user.id;
    tx.approvedByName = user.fullName;
    tx.approvedAt = new Date().toISOString();
    tx.approvalNotes = reason;

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'FINANCIAL_TX_REJECTED',
      summaryAr: `رفض رئيس مجلس الإدارة للقيد المالي ${tx.entryNumber} (${tx.title}). السبب: ${reason}`,
    });
    writeAuthStore(state);
    res.json({transaction: tx});
  },
);

// Step 3: Execute financial transaction (Requires explicit Chairman approval + distinct Executor)
charityApiRouter.post(
  '/finance/transactions/:id/execute',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('finance', 'الإدارة المالية والخزينة'),
  requireGranular('canExecuteFinancial', 'تنفيذ المعاملات المالية والصرف'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const state = readAuthStore();
      const tx = state.financialTransactions.find((t) => t.id === req.params.id);
      if (!tx) {
        res.status(404).json({error: 'القيد المالي غير موجود.'});
        return;
      }
      if (tx.workflowStatus === 'executed') {
        res.status(409).json({error: 'منع تكرار الصرف: تم تنفيذ هذا القيد المالي بالفعل مسبقاً.'});
        return;
      }
      if (tx.workflowStatus !== 'approved') {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'CHAIRMAN_APPROVAL_BYPASS_BLOCKED',
          summaryAr: `منع خادمي لمحاولة تنفيذ القيد المالي (${tx.entryNumber}) قبل اعتماد رئيس مجلس الإدارة (الحالة الحالية: ${tx.workflowStatus}).`,
        });
        writeAuthStore(state);
        res.status(403).json({
          error:
            'مرفوض أمنياً: لا يمكن تنفيذ أي صرف مالي قبل موافقة واعتماد رئيس مجلس الإدارة أولاً.',
        });
        return;
      }

      // Defense-in-depth: explicitly verify the recorded approver is the President
      const approver = tx.approvedBy ? state.users.find((u) => u.id === tx.approvedBy) : null;
      if (!approver || approver.role !== 'president') {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'PRESIDENT_APPROVAL_BYPASS_BLOCKED',
          summaryAr: `منع خادمي لمحاولة تنفيذ القيد المالي (${tx.entryNumber}) لعدم ثبوت اعتماد صريح من رئيس مجلس الإدارة.`,
        });
        writeAuthStore(state);
        res.status(403).json({
          error:
            'مرفوض أمنياً: لا يمكن تنفيذ أي صرف مالي دون موافقة واعتماد صريح من رئيس مجلس الإدارة.',
        });
        return;
      }

      if (tx.recordedBy === user.id || tx.approvedBy === user.id) {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'SEGREGATION_VIOLATION_BLOCKED',
          summaryAr: `منع خادمي لمحاولة تنفيذ القيد المالي (${tx.entryNumber}) بواسطة مُسجِّل العملية أو مُعتمِدها.`,
        });
        writeAuthStore(state);
        res.status(403).json({
          error:
            'مرفوض وفق فصل الاختصاصات الثلاثي: يجب أن يكون منفّذ الصرف المالي مستخدماً ثالثاً مختلفاً عن مُسجِّل العملية وعن رئيس مجلس الإدارة المُعتمِد لها.',
        });
        return;
      }

      assertFundPurposeCompatibility(tx.fundType, tx.purposeCategory, tx.projectId);

      const sourceAcc = state.treasuryAccounts.find((a) => a.id === tx.sourceAccountId);
      if (!sourceAcc) {
        res.status(404).json({error: 'الخزينة أو الحساب المصدر غير موجود.'});
        return;
      }

      // Debit source account and specific fund pool
      debitTreasuryAccount(sourceAcc, tx.fundType, tx.amount);

      // If inter-account transfer, credit destination account in the exact same fund pool
      if (tx.txType === 'transfer' && tx.destinationAccountId) {
        const destAcc = state.treasuryAccounts.find((a) => a.id === tx.destinationAccountId);
        if (!destAcc) {
          res.status(404).json({error: 'الحساب المحوّل إليه غير موجود.'});
          return;
        }
        creditTreasuryAccount(destAcc, tx.fundType, tx.amount);
      }

      const ref =
        typeof req.body?.executionReference === 'string'
          ? req.body.executionReference.trim().slice(0, 160)
          : '';
      tx.workflowStatus = 'executed';
      tx.executedBy = user.id;
      tx.executedByName = user.fullName;
      tx.executedAt = new Date().toISOString();
      tx.executionReference = ref;

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FINANCIAL_TX_EXECUTED',
        summaryAr: `الخطوة ٣ (تنفيذ الصرف): تنفيذ القيد المالي ${tx.entryNumber} (${tx.title}) بقيمة ${tx.amount} ج.م من (${sourceAcc.name} — ${FUND_POOL_LABELS_AR[tx.fundType]}).`,
      });
      writeAuthStore(state);
      res.json({transaction: tx});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// Documented Reversal Entry (immutable accounting trail — never deletes original)
charityApiRouter.post(
  '/finance/transactions/:id/reverse',
  requireAuth,
  requireRoles(['president']),
  requireGranular('canDeleteData', 'حذف / تصحيح البيانات'),
  requireGranular('canApproveTransactions', 'اعتماد المعاملات'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const state = readAuthStore();
      const tx = state.financialTransactions.find((t) => t.id === req.params.id);
      if (!tx) {
        res.status(404).json({error: 'القيد المالي غير موجود.'});
        return;
      }
      if (tx.workflowStatus !== 'executed') {
        res.status(409).json({
          error: 'يُنشأ القيد التصحيحي العكسي فقط للعمليات المالية التي تم تنفيذ صرفها بالفعل.',
        });
        return;
      }

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 5) {
        res.status(400).json({error: 'يرجى كتابة سبب موثق ومفصل للقيد التصحيحي (٥ أحرف على الأقل).'});
        return;
      }

      const sourceAcc = state.treasuryAccounts.find((a) => a.id === tx.sourceAccountId);
      if (!sourceAcc) {
        res.status(404).json({error: 'الحساب المصدر الأصلي غير موجود.'});
        return;
      }

      // If transfer, first debit back destination account before crediting source
      if (tx.txType === 'transfer' && tx.destinationAccountId) {
        const destAcc = state.treasuryAccounts.find((a) => a.id === tx.destinationAccountId);
        if (!destAcc) {
          res.status(404).json({error: 'الحساب الوجهة الأصلي غير موجود.'});
          return;
        }
        debitTreasuryAccount(destAcc, tx.fundType, tx.amount);
      }

      creditTreasuryAccount(sourceAcc, tx.fundType, tx.amount);

      const now = new Date().toISOString();
      tx.workflowStatus = 'reversed';
      tx.reversedBy = user.id;
      tx.reversedByName = user.fullName;
      tx.reversedAt = now;
      tx.reversalReason = reason;

      const reversalEntry: FinancialTransaction = {
        id: crypto.randomUUID(),
        entryNumber: generateFinancialEntryNumber(state),
        txType: 'reversal',
        title: `قيد تصحيحي عكسي للقيد ${tx.entryNumber}`,
        description: `ردّ مبلغ ${tx.amount} ج.م إلى (${sourceAcc.name} — ${FUND_POOL_LABELS_AR[tx.fundType]}). السبب: ${reason}`,
        amount: tx.amount,
        txDate: now.slice(0, 10),
        monthKey: now.slice(0, 7),
        fundType: tx.fundType,
        purposeCategory: tx.purposeCategory,
        sourceAccountId: tx.sourceAccountId,
        sourceAccountName: tx.sourceAccountName,
        destinationAccountId: tx.destinationAccountId,
        destinationAccountName: tx.destinationAccountName,
        projectId: tx.projectId,
        projectName: tx.projectName,
        familyId: tx.familyId,
        familyName: tx.familyName,
        workflowStatus: 'executed',
        recordedBy: user.id,
        recordedByName: user.fullName,
        recordedAt: now,
        approvedBy: user.id,
        approvedByName: user.fullName,
        approvedAt: now,
        approvalNotes: reason,
        executedBy: user.id,
        executedByName: user.fullName,
        executedAt: now,
        executionReference: `REV-${tx.entryNumber}`,
        reversedBy: null,
        reversedByName: null,
        reversedAt: null,
        reversalReason: '',
        reversesTransactionId: tx.id,
      };

      state.financialTransactions.unshift(reversalEntry);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'FINANCIAL_TX_REVERSED',
        summaryAr: `إنشاء قيد تصحيحي موثق (${reversalEntry.entryNumber}) لعكس القيد (${tx.entryNumber}) بقيمة ${tx.amount} ج.م. السبب: ${reason}`,
      });
      writeAuthStore(state);
      res.json({originalTransaction: tx, reversalEntry});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 5. CHARITY PROJECTS & AID PROGRAMS (/api/projects)
// =============================================================================

charityApiRouter.get(
  '/projects',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('projects', 'المشروعات الخيرية'),
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    res.json({
      projects: computeProjectsWithMetrics(state),
      families: getScopedFamilies(state).map((f) => ({
        id: f.id,
        fileNumber: f.fileNumber,
        headOfHousehold: f.headOfHousehold,
      })),
    });
  },
);

charityApiRouter.post(
  '/projects',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('projects', 'المشروعات الخيرية'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createProjectSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const budget = normalizeNonNegativeMoney(parsed.budget);
      const now = new Date().toISOString();

      const project: CharityProject = {
        id: crypto.randomUUID(),
        code: generateProjectCode(state),
        name: parsed.name,
        category: parsed.category,
        description: parsed.description,
        budget,
        status: parsed.status,
        completionPercent: 0,
        beneficiaryFamilyIds: parsed.beneficiaryFamilyIds,
        finalReport: '',
        attachments: [],
        createdBy: user.id,
        createdByName: user.fullName,
        createdAt: now,
        updatedAt: now,
      };

      state.projects.unshift(project);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PROJECT_CREATED',
        summaryAr: `إنشاء مشروع خيري جديد (${project.code} — ${project.name}) بميزانية ${project.budget} ج.م.`,
      });
      writeAuthStore(state);
      const enriched = computeProjectsWithMetrics(state).find((p) => p.id === project.id)!;
      res.status(201).json({project: enriched});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.patch(
  '/projects/:id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('projects', 'المشروعات الخيرية'),
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = updateProjectSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const project = state.projects.find((p) => p.id === req.params.id);
      if (!project) {
        res.status(404).json({error: 'المشروع الخيري غير موجود.'});
        return;
      }

      if (parsed.name !== undefined) project.name = parsed.name;
      if (parsed.description !== undefined) project.description = parsed.description;
      if (parsed.budget !== undefined) project.budget = normalizeNonNegativeMoney(parsed.budget);
      if (parsed.status !== undefined) project.status = parsed.status;
      if (parsed.completionPercent !== undefined) {
        project.completionPercent = parsed.completionPercent;
      }
      if (parsed.beneficiaryFamilyIds !== undefined) {
        project.beneficiaryFamilyIds = parsed.beneficiaryFamilyIds;
      }
      if (parsed.finalReport !== undefined) project.finalReport = parsed.finalReport;
      project.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PROJECT_UPDATED',
        summaryAr: `تحديث بيانات المشروع الخيري (${project.code} — ${project.name}) — نسبة الإنجاز: ${project.completionPercent}%.`,
      });
      writeAuthStore(state);
      const enriched = computeProjectsWithMetrics(state).find((p) => p.id === project.id)!;
      res.json({project: enriched});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.post(
  '/projects/:id/attachments',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('projects', 'المشروعات الخيرية'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = uploadDocumentSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const project = state.projects.find((p) => p.id === req.params.id);
      if (!project) {
        res.status(404).json({error: 'المشروع الخيري غير موجود.'});
        return;
      }

      const docRef = savePrivateDocument({
        state,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        base64Data: parsed.base64Data,
        entityType: 'project',
        entityId: project.id,
        uploadedBy: user.id,
        uploadedByName: user.fullName,
      });

      project.attachments = [docRef, ...(project.attachments || [])];
      project.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PROJECT_DOCUMENT_UPLOADED',
        summaryAr: `رفع مرفق/صورة (${docRef.fileName}) للمشروع الخيري (${project.code}).`,
      });
      writeAuthStore(state);
      const enriched = computeProjectsWithMetrics(state).find((p) => p.id === project.id)!;
      res.status(201).json({document: docRef, project: enriched});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 6. WAREHOUSE & IN-KIND DONATIONS (/api/warehouse)
// =============================================================================

charityApiRouter.get(
  '/warehouse',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('warehouse', 'المخازن والتبرعات العينية'),
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    const lowStockItems = state.warehouseItems.filter((i) => i.availableQty <= i.minStockAlert);
    res.json({
      items: state.warehouseItems,
      movements: state.warehouseMovements,
      lowStockItems,
      families: getScopedFamilies(state).map((f) => ({
        id: f.id,
        fileNumber: f.fileNumber,
        headOfHousehold: f.headOfHousehold,
      })),
    });
  },
);

charityApiRouter.post(
  '/warehouse/items',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('warehouse', 'المخازن والتبرعات العينية'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createWarehouseItemSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const now = new Date().toISOString();
      const receivedDate = parsed.receivedDate || now.slice(0, 10);

      const item: WarehouseItem = {
        id: crypto.randomUUID(),
        itemCode: generateWarehouseCode(state),
        name: parsed.name,
        category: parsed.category,
        condition: parsed.condition,
        unit: parsed.unit,
        minStockAlert: parsed.minStockAlert,
        totalIn: parsed.initialQty,
        totalOut: 0,
        availableQty: parsed.initialQty,
        receivedDate,
        donationSource: parsed.donationSource,
        notes: parsed.notes,
        createdBy: user.id,
        createdByName: user.fullName,
        createdAt: now,
        updatedAt: now,
      };
      state.warehouseItems.unshift(item);

      if (parsed.initialQty > 0) {
        const movement: WarehouseMovement = {
          id: crypto.randomUUID(),
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          movementType: 'in',
          quantity: parsed.initialQty,
          movementDate: receivedDate,
          sourceOrBeneficiary: parsed.donationSource || 'رصيد وارد افتتاحي',
          beneficiaryFamilyId: null,
          beneficiaryFamilyName: null,
          notes: parsed.notes || 'تسجيل صنف جديد بالمخزن',
          recordedBy: user.id,
          recordedByName: user.fullName,
          recordedAt: now,
        };
        state.warehouseMovements.unshift(movement);
      }

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'WAREHOUSE_ITEM_CREATED',
        summaryAr: `إضافة صنف مخزني عيني (${item.itemCode} — ${item.name}) بكمية واردة ${item.availableQty} ${item.unit}.`,
      });
      writeAuthStore(state);
      res.status(201).json({item});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.post(
  '/warehouse/movements',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('warehouse', 'المخازن والتبرعات العينية'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createWarehouseMovementSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const item = state.warehouseItems.find((i) => i.id === parsed.itemId);
      if (!item) {
        res.status(404).json({error: 'الصنف المخزني غير موجود.'});
        return;
      }

      if (parsed.movementType === 'out' && parsed.quantity > item.availableQty) {
        res.status(400).json({
          error: `مرفوض: الكمية المطلوب صرفها (${parsed.quantity} ${item.unit}) تتجاوز الكمية المتاحة حالياً في المخزن (${item.availableQty} ${item.unit}).`,
        });
        return;
      }

      const family = parsed.beneficiaryFamilyId
        ? state.families.find((f) => f.id === parsed.beneficiaryFamilyId) || null
        : null;

      if (parsed.movementType === 'in') {
        item.totalIn += parsed.quantity;
        item.availableQty += parsed.quantity;
      } else {
        item.totalOut += parsed.quantity;
        item.availableQty -= parsed.quantity;
      }

      const now = new Date().toISOString();
      item.updatedAt = now;

      const movement: WarehouseMovement = {
        id: crypto.randomUUID(),
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        movementType: parsed.movementType,
        quantity: parsed.quantity,
        movementDate: parsed.movementDate || now.slice(0, 10),
        sourceOrBeneficiary:
          parsed.sourceOrBeneficiary ||
          (family ? `${family.headOfHousehold} (${family.fileNumber})` : parsed.movementType === 'in' ? 'متبرع عيني' : 'صرف ميداني'),
        beneficiaryFamilyId: family ? family.id : null,
        beneficiaryFamilyName: family ? `${family.headOfHousehold} (${family.fileNumber})` : null,
        notes: parsed.notes,
        recordedBy: user.id,
        recordedByName: user.fullName,
        recordedAt: now,
      };

      state.warehouseMovements.unshift(movement);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'WAREHOUSE_MOVEMENT',
        summaryAr: `${movement.movementType === 'in' ? 'إضافة وارد مخزني' : 'صرف عيني من المخزن'}: (${item.itemCode} — ${item.name}) بكمية ${movement.quantity} ${item.unit}. المتاح الآن: ${item.availableQty}.`,
      });
      writeAuthStore(state);
      res.status(201).json({movement, item});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 7. VOLUNTEERS MODULE (/api/volunteers — Data Managed Internally, NO Admin Login)
// =============================================================================

charityApiRouter.get(
  '/volunteers',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('volunteers', 'إدارة المتطوعين والمهام'),
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();

    const volunteers: VolunteerProfile[] = state.volunteers.map((v) => {
      const assignedCount = state.tasks.filter(
        (t) =>
          t.assignedVolunteerIds.includes(v.id) ||
          (v.userId && t.participantIds.includes(v.userId)),
      ).length;
      const participatedActivities = new Set(
        state.tasks
          .filter(
            (t) =>
              t.assignedVolunteerIds.includes(v.id) ||
              (v.userId && t.participantIds.includes(v.userId)),
          )
          .map((t) => t.activityId),
      ).size;

      return {
        ...v,
        assignedTasksCount: assignedCount,
        participatedActivitiesCount: participatedActivities,
      };
    });

    res.json({volunteers, tasks: state.tasks});
  },
);

charityApiRouter.post(
  '/volunteers',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('volunteers', 'إدارة المتطوعين والمهام'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = createVolunteerSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const now = new Date().toISOString();

      // Volunteer record only — intentionally NEVER creates an administrative login account
      const volunteer: VolunteerProfile = {
        id: crypto.randomUUID(),
        userId: null,
        fullName: parsed.fullName,
        phone: parsed.phone,
        address: parsed.address,
        skills: parsed.skills,
        teamName: parsed.teamName,
        joinedAt: parsed.joinedAt || now.slice(0, 10),
        rating: 0,
        evaluationNotes: '',
        isActive: true,
        participatedActivitiesCount: 0,
        assignedTasksCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      state.volunteers.unshift(volunteer);
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'VOLUNTEER_ADDED',
        summaryAr: `تسجيل متطوع جديد (${volunteer.fullName}) ضمن فريق (${volunteer.teamName}) — سجل متطوع فقط بدون حساب دخول إداري.`,
      });
      writeAuthStore(state);
      res.status(201).json({volunteer});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.patch(
  '/volunteers/:id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('volunteers', 'إدارة المتطوعين والمهام'),
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const parsed = updateVolunteerSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const vol = state.volunteers.find((v) => v.id === req.params.id);
      if (!vol) {
        res.status(404).json({error: 'ملف المتطوع غير موجود.'});
        return;
      }

      if (parsed.fullName !== undefined) vol.fullName = parsed.fullName;
      if (parsed.phone !== undefined) vol.phone = parsed.phone;
      if (parsed.address !== undefined) vol.address = parsed.address;
      if (parsed.skills !== undefined) vol.skills = parsed.skills;
      if (parsed.teamName !== undefined) vol.teamName = parsed.teamName;
      if (parsed.rating !== undefined) vol.rating = parsed.rating;
      if (parsed.evaluationNotes !== undefined) vol.evaluationNotes = parsed.evaluationNotes;
      if (parsed.isActive !== undefined) vol.isActive = parsed.isActive;
      vol.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'VOLUNTEER_UPDATED',
        summaryAr: `تحديث بيانات وتقييم المتطوع (${vol.fullName}) — التقييم: ${vol.rating}/5.`,
      });
      writeAuthStore(state);
      res.json({volunteer: vol});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.post(
  '/volunteers/:id/assign-task',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('volunteers', 'إدارة المتطوعين والمهام'),
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const vol = state.volunteers.find((v) => v.id === req.params.id);
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : '';
    const task = state.tasks.find((t) => t.id === taskId);
    if (!vol || !task) {
      res.status(404).json({error: 'المتطوع أو المهمة غير موجودين.'});
      return;
    }

    if (!task.assignedVolunteerIds.includes(vol.id)) {
      task.assignedVolunteerIds.push(vol.id);
    }
    if (!task.participantNames.includes(vol.fullName)) {
      task.participantNames.push(vol.fullName);
    }

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'VOLUNTEER_TASK_ASSIGNED',
      summaryAr: `تكليف المتطوع (${vol.fullName}) بالمهمة (${task.title}).`,
    });
    writeAuthStore(state);
    res.json({task});
  },
);

// =============================================================================
// 8. ADMINISTRATIVE LEADERSHIP REGISTRY (/api/board/registry — CHAIRMAN ONLY)
// =============================================================================

charityApiRouter.get(
  '/board/registry',
  requireAuth,
  requireRoles(['president']),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    const members = state.users.map((u) => toPublicUser(state, u));
    res.json({members});
  },
);

charityApiRouter.patch(
  '/board/registry/:id',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'الحساب الإداري غير موجود.'});
      return;
    }
    if (typeof req.body?.boardPosition === 'string' && req.body.boardPosition.trim()) {
      target.boardPosition = req.body.boardPosition.trim().slice(0, 100);
    }
    if (
      req.body?.membershipStatus === 'active' ||
      req.body?.membershipStatus === 'inactive' ||
      req.body?.membershipStatus === 'honorary'
    ) {
      target.membershipStatus = req.body.membershipStatus;
    }
    if (typeof req.body?.phone === 'string') {
      target.phone = req.body.phone.trim().slice(0, 30);
    }
    target.updatedAt = new Date().toISOString();

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'BOARD_MEMBER_UPDATED',
      summaryAr: `تحديث بيانات السجل القيادي للأستاذ/ة (${target.fullName}) — المنصب: ${target.boardPosition}.`,
    });
    writeAuthStore(state);
    res.json({member: toPublicUser(state, target)});
  },
);

// =============================================================================
// 9. NOTIFICATIONS & ALERTS CENTER (/api/notifications)
// =============================================================================

charityApiRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const state = readAuthStore();
  const user = req.currentUser!;
  const perms = req.permissions!;
  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);
  const currentMonth = getCurrentMonthKey();
  const notifications: AppNotification[] = [];

  // 1. Due / overdue charity pensions
  if (perms.modulePermissions.pensions && perms.canViewData) {
    const activePlans = state.pensionPlans.filter((p) => p.status === 'active');
    let unpaidCurrentCount = 0;
    let totalArrearsMonths = 0;
    for (const plan of activePlans) {
      const paidSet = new Set(
        state.monthlyDisbursements
          .filter((d) => d.familyId === plan.familyId)
          .map((d) => d.monthKey),
      );
      if (!paidSet.has(currentMonth)) unpaidCurrentCount += 1;
      const expected = listMonthKeysRange(plan.startMonthKey, currentMonth);
      totalArrearsMonths += expected.filter((m) => !paidSet.has(m)).length;
    }
    if (unpaidCurrentCount > 0 || totalArrearsMonths > 0) {
      notifications.push({
        id: `pension-due-${currentMonth}`,
        type: 'pension_due',
        severity: totalArrearsMonths > unpaidCurrentCount ? 'urgent' : 'warning',
        titleAr: 'مواعيد ومتأخرات معاشات الخير',
        messageAr: `يوجد ${unpaidCurrentCount} معاش شهري مستحق الصرف لشهر ${currentMonth} (إجمالي الأشهر المتأخرة والمستحقة: ${totalArrearsMonths}).`,
        targetTab: 'pensions',
        createdAt: nowIso,
      });
    }
  }

  // 2. Families pending social research / approval
  if (perms.modulePermissions.families && (perms.canViewData || perms.canApproveTransactions)) {
    const pendingFamilies = state.families.filter((f) => f.approvalStatus === 'pending_review');
    if (pendingFamilies.length > 0) {
      notifications.push({
        id: `families-pending-${pendingFamilies.length}`,
        type: 'family_pending',
        severity: 'warning',
        titleAr: 'طلبات أسر بانتظار المراجعة والاعتماد',
        messageAr: `يوجد ${pendingFamilies.length} ملف أسرة بحاجة إلى استكمال البحث الاجتماعي وقرار الاعتماد.`,
        targetTab: 'families',
        createdAt: pendingFamilies[0].createdAt,
      });
    }
  }

  // 3. Financial transactions waiting for Step 2 President Approval (President only)
  if (user.role === 'president') {
    const awaitingApproval = state.financialTransactions.filter(
      (t) => t.workflowStatus === 'recorded',
    );
    if (awaitingApproval.length > 0) {
      notifications.push({
        id: `fin-approval-${awaitingApproval.length}`,
        type: 'approval_needed',
        severity: 'urgent',
        titleAr: 'طلبات صرف مالي بانتظار اعتماد رئيس مجلس الإدارة',
        messageAr: `يوجد ${awaitingApproval.length} طلب صرف مالي مسجل بانتظار مراجعة واعتماد رئيس مجلس الإدارة.`,
        targetTab: 'finance',
        createdAt: awaitingApproval[0].recordedAt,
      });
    }
  }

  // 4. Financial transactions waiting for Step 3 Execution
  if (perms.modulePermissions.finance && perms.canExecuteFinancial) {
    const awaitingExecution = state.financialTransactions.filter(
      (t) => t.workflowStatus === 'approved' && t.recordedBy !== user.id && t.approvedBy !== user.id,
    );
    if (awaitingExecution.length > 0) {
      notifications.push({
        id: `fin-exec-${awaitingExecution.length}`,
        type: 'execution_needed',
        severity: 'urgent',
        titleAr: 'معاملات معتمدة جاهزة لتنفيذ الصرف',
        messageAr: `يوجد ${awaitingExecution.length} قيد مالي معتمد بانتظار تنفيذ الصرف من الخزينة.`,
        targetTab: 'finance',
        createdAt: awaitingExecution[0].approvedAt || nowIso,
      });
    }
  }

  // 5. Low warehouse stock alerts
  if (perms.canManageWarehouse) {
    const lowStock = state.warehouseItems.filter((i) => i.availableQty <= i.minStockAlert);
    if (lowStock.length > 0) {
      notifications.push({
        id: `wh-low-${lowStock.length}`,
        type: 'low_stock',
        severity: 'warning',
        titleAr: 'تنبيه انخفاض رصيد المخزن العيني',
        messageAr: `وصلت ${lowStock.length} أصناف في المخزن للحد الأدنى أو نفدت (${lowStock.slice(0, 2).map((i) => i.name).join('، ')}).`,
        targetTab: 'warehouse',
        createdAt: lowStock[0].updatedAt,
      });
    }
  }

  // 6. Overdue tasks (only if user has permission for activities or volunteers)
  if (perms.canViewAllActivities || perms.canManageVolunteers) {
    const overdueTasks = state.tasks.filter(
      (t) => t.status !== 'completed' && t.dueDate && t.dueDate < todayIso,
    );
    if (overdueTasks.length > 0) {
      notifications.push({
        id: `tasks-overdue-${overdueTasks.length}`,
        type: 'task_overdue',
        severity: 'warning',
        titleAr: 'مهام متأخرة عن موعدها المحدد',
        messageAr: `يوجد ${overdueTasks.length} مهمة تشغيلية أو تطوعية تجاوزت تاريخ الاستحقاق.`,
        targetTab: 'tasks',
        createdAt: overdueTasks[0].createdAt,
      });
    }
  }

  // 7. Recent donations in last 7 days
  if (perms.modulePermissions.donations && perms.canViewData) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentDons = state.donations.filter((d) => d.donationDate >= sevenDaysAgo);
    if (recentDons.length > 0) {
      notifications.push({
        id: `don-recent-${recentDons.length}`,
        type: 'new_donation',
        severity: 'info',
        titleAr: 'تبرعات جديدة مسجلة هذا الأسبوع',
        messageAr: `تم تسجيل ${recentDons.length} عملية تبرع خلال آخر ٧ أيام (أحدث إيصال: ${recentDons[0].receiptNumber}).`,
        targetTab: 'donations',
        createdAt: recentDons[0].recordedAt,
      });
    }
  }

  res.json({notifications, count: notifications.length});
});

// =============================================================================
// 10. ORGANIZATION SETTINGS & DATABASE BACKUP (/api/settings — CHAIRMAN ONLY)
// =============================================================================

charityApiRouter.get('/settings', requireAuth, (_req: AuthedRequest, res) => {
  const state = readAuthStore();
  res.json({settings: state.organizationSettings});
});

charityApiRouter.patch(
  '/settings',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const parsed = updateSettingsSchema.parse(req.body);
      const user = req.currentUser!;
      const state = readAuthStore();
      const s = state.organizationSettings;

      if (parsed.nameAr !== undefined) s.nameAr = parsed.nameAr;
      if (parsed.sloganAr !== undefined) s.sloganAr = parsed.sloganAr;
      if (parsed.secondarySloganAr !== undefined) s.secondarySloganAr = parsed.secondarySloganAr;
      if (parsed.registrationNumber !== undefined) s.registrationNumber = parsed.registrationNumber;
      if (parsed.phone !== undefined) s.phone = parsed.phone;
      if (parsed.email !== undefined) s.email = parsed.email;
      if (parsed.address !== undefined) s.address = parsed.address;
      if (parsed.receiptPrefix !== undefined) s.receiptPrefix = parsed.receiptPrefix.toUpperCase();
      if (parsed.receiptFooterAr !== undefined) s.receiptFooterAr = parsed.receiptFooterAr;
      if (parsed.authorizedSignerName !== undefined) {
        s.authorizedSignerName = parsed.authorizedSignerName;
      }
      if (parsed.customDonationTypes !== undefined) {
        s.customDonationTypes = parsed.customDonationTypes;
      }
      if (parsed.customExpenseTypes !== undefined) s.customExpenseTypes = parsed.customExpenseTypes;
      if (parsed.customAidTypes !== undefined) s.customAidTypes = parsed.customAidTypes;

      if (parsed.resetLogoToDefault) {
        s.customLogoUrl = null;
      } else if (parsed.logoUpload) {
        const docRef = savePrivateDocument({
          state,
          fileName: parsed.logoUpload.fileName,
          mimeType: parsed.logoUpload.mimeType,
          base64Data: parsed.logoUpload.base64Data,
          entityType: 'organization',
          entityId: 'org-logo',
          uploadedBy: user.id,
          uploadedByName: user.fullName,
        });
        s.customLogoUrl = `/api/files/${docRef.id}`;
      }

      s.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'SETTINGS_UPDATED',
        summaryAr: 'تحديث إعدادات جمعية أبواب الخير وتنسيق الإيصالات والتصنيفات.',
      });
      writeAuthStore(state);
      res.json({settings: s});
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.get(
  '/settings/backup',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const state = readAuthStore();

    const sanitizedBackup = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.fullName,
      organization: state.organizationSettings,
      users: state.users.map((u) => toPublicUser(state, u)),
      activities: state.activities,
      tasks: state.tasks,
      families: state.families.map(toPublicFamily),
      pensionPlans: state.pensionPlans,
      monthlyDisbursements: state.monthlyDisbursements,
      donations: state.donations,
      treasuryAccounts: state.treasuryAccounts,
      financialTransactions: state.financialTransactions,
      projects: state.projects,
      warehouseItems: state.warehouseItems,
      warehouseMovements: state.warehouseMovements,
      volunteers: state.volunteers,
      auditLogs: state.auditLogs,
    };

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'DATABASE_BACKUP_EXPORTED',
      summaryAr: `استخراج نسخة احتياطية كاملة (JSON) لقاعدة بيانات أبواب الخير بواسطة (${user.fullName}).`,
    });
    writeAuthStore(state);
    res.json(sanitizedBackup);
  },
);

const restoreBackupSchema = z.object({
  organization: z.record(z.string(), z.unknown()).optional(),
  activities: z.array(z.any()).optional(),
  tasks: z.array(z.any()).optional(),
  families: z.array(z.any()).optional(),
  pensionPlans: z.array(z.any()).optional(),
  monthlyDisbursements: z.array(z.any()).optional(),
  donations: z.array(z.any()).optional(),
  treasuryAccounts: z.array(z.any()).optional(),
  financialTransactions: z.array(z.any()).optional(),
  projects: z.array(z.any()).optional(),
  warehouseItems: z.array(z.any()).optional(),
  warehouseMovements: z.array(z.any()).optional(),
  volunteers: z.array(z.any()).optional(),
});

charityApiRouter.post(
  '/settings/restore',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const payload = restoreBackupSchema.parse(req.body);
      const hasAnySection =
        payload.organization !== undefined ||
        payload.families !== undefined ||
        payload.donations !== undefined ||
        payload.treasuryAccounts !== undefined ||
        payload.financialTransactions !== undefined ||
        payload.pensionPlans !== undefined ||
        payload.projects !== undefined ||
        payload.volunteers !== undefined;

      if (!hasAnySection) {
        res.status(400).json({
          error: 'ملف النسخة الاحتياطية غير صالح أو لا يحتوي على بيانات قابلة للاستعادة.',
        });
        return;
      }

      // Always create an automatic safety snapshot before restoring
      const snapshotFile = saveSafetyBackupSnapshot('pre-restore', user.fullName);
      const state = readAuthStore();

      // Preserve existing encrypted national IDs for matching family records
      const existingFamilySecrets = new Map(
        state.families.map((f) => [
          f.id,
          {nationalIdEncrypted: f.nationalIdEncrypted, nationalIdHash: f.nationalIdHash},
        ]),
      );

      if (payload.organization && typeof payload.organization === 'object') {
        state.organizationSettings = {
          ...state.organizationSettings,
          ...(payload.organization as Partial<AuthDatabaseState['organizationSettings']>),
          currency: 'EGP',
          updatedAt: new Date().toISOString(),
        };
      }
      if (Array.isArray(payload.activities)) state.activities = payload.activities;
      if (Array.isArray(payload.tasks)) state.tasks = payload.tasks;
      if (Array.isArray(payload.families)) {
        state.families = payload.families.map((f: StoredBeneficiaryFamilyRecord) => {
          const prev = existingFamilySecrets.get(f.id);
          return {
            ...f,
            nationalIdEncrypted: f.nationalIdEncrypted || prev?.nationalIdEncrypted,
            nationalIdHash: f.nationalIdHash || prev?.nationalIdHash,
          };
        });
      }
      if (Array.isArray(payload.pensionPlans)) state.pensionPlans = payload.pensionPlans;
      if (Array.isArray(payload.monthlyDisbursements)) {
        state.monthlyDisbursements = payload.monthlyDisbursements;
      }
      if (Array.isArray(payload.donations)) state.donations = payload.donations;
      if (Array.isArray(payload.treasuryAccounts) && payload.treasuryAccounts.length > 0) {
        state.treasuryAccounts = payload.treasuryAccounts;
      }
      if (Array.isArray(payload.financialTransactions)) {
        state.financialTransactions = payload.financialTransactions;
      }
      if (Array.isArray(payload.projects)) state.projects = payload.projects;
      if (Array.isArray(payload.warehouseItems)) state.warehouseItems = payload.warehouseItems;
      if (Array.isArray(payload.warehouseMovements)) {
        state.warehouseMovements = payload.warehouseMovements;
      }
      if (Array.isArray(payload.volunteers)) state.volunteers = payload.volunteers;

      // Active user accounts, encrypted password hashes, and audit history are strictly preserved
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'DATABASE_BACKUP_RESTORED',
        summaryAr: `استعاد رئيس مجلس الإدارة (${user.fullName}) نسخة احتياطية للبيانات التشغيلية والمالية بعد حفظ لقطة أمان مسبقة (${snapshotFile}).`,
      });
      writeAuthStore(state);

      res.json({
        success: true,
        snapshotFile,
        restoredCounts: {
          families: state.families.length,
          pensionPlans: state.pensionPlans.length,
          donations: state.donations.length,
          treasuryAccounts: state.treasuryAccounts.length,
          financialTransactions: state.financialTransactions.length,
          projects: state.projects.length,
          volunteers: state.volunteers.length,
          warehouseItems: state.warehouseItems.length,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 10B. ENCRYPTED BACKUP VAULT (AES-256-GCM IN CLOUDFLARE R2 + RETENTION + RESTORE)
// =============================================================================

charityApiRouter.get(
  '/settings/backups',
  requireAuth,
  requireRoles(['president']),
  async (_req: AuthedRequest, res) => {
    try {
      const backups = await listEncryptedBackups();
      res.json({
        storageBackend: getObjectStorageMode(),
        retentionPolicy: getBackupRetentionPolicy(),
        backups,
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const createEncryptedBackupSchema = z.object({
  label: z.string().trim().max(32).optional().default('manual'),
});

charityApiRouter.post(
  '/settings/backups/encrypted',
  requireAuth,
  requireRoles(['president']),
  async (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const parsed = createEncryptedBackupSchema.parse(req.body || {});
      const state = readAuthStore();
      const result = await createEncryptedBackup(state, {
        label: parsed.label,
        createdBy: user.fullName,
      });

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'ENCRYPTED_BACKUP_CREATED',
        summaryAr: `إنشاء نسخة احتياطية مشفرة (AES-256-GCM) وحفظها بأمان (${result.backup.key}) بواسطة (${user.fullName}).`,
      });
      writeAuthStore(state);

      res.status(201).json(result);
    } catch (err) {
      sendError(res, err);
    }
  },
);

const encryptedBackupKeySchema = z.object({
  key: z.string().trim().min(10, 'يرجى تحديد معرّف النسخة الاحتياطية المشفرة.'),
});

charityApiRouter.post(
  '/settings/backups/verify',
  requireAuth,
  requireRoles(['president']),
  async (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const parsed = encryptedBackupKeySchema.parse(req.body);
      const verification = await verifyEncryptedBackup(parsed.key);

      const state = readAuthStore();
      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'ENCRYPTED_BACKUP_VERIFIED',
        summaryAr: `اختبار فك التشفير والتحقق من سلامة النسخة الاحتياطية المشفرة (${parsed.key}) بنجاح (SHA-256 متطابق).`,
      });
      writeAuthStore(state);

      res.json(verification);
    } catch (err) {
      sendError(res, err);
    }
  },
);

charityApiRouter.post(
  '/settings/backups/restore-encrypted',
  requireAuth,
  requireRoles(['president']),
  async (req: AuthedRequest, res) => {
    try {
      const user = req.currentUser!;
      const parsed = encryptedBackupKeySchema.parse(req.body);
      const currentState = readAuthStore();

      // Always create a pre-restore AES-256-GCM safety backup before replacing live state
      const preRestore = await createEncryptedBackup(currentState, {
        label: 'pre-restore',
        createdBy: user.fullName,
      });

      const {state: restoredRaw, sha256} = await loadVerifiedEncryptedBackupState(parsed.key);
      const restored = replaceAuthStoreState(restoredRaw);

      logSecurityEvent(restored, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'ENCRYPTED_BACKUP_RESTORED',
        summaryAr: `استعادة نسخة احتياطية مشفرة موثّقة (${parsed.key}) بعد حفظ لقطة أمان مسبقة (${preRestore.backup.key}) بواسطة (${user.fullName}).`,
      });
      writeAuthStore(restored);

      res.json({
        success: true,
        restoredKey: parsed.key,
        verifiedSha256: sha256,
        preRestoreBackupKey: preRestore.backup.key,
        restoredCounts: {
          users: restored.users.length,
          families: restored.families.length,
          pensionPlans: restored.pensionPlans.length,
          donations: restored.donations.length,
          treasuryAccounts: restored.treasuryAccounts.length,
          financialTransactions: restored.financialTransactions.length,
          projects: restored.projects.length,
          volunteers: restored.volunteers.length,
          warehouseItems: restored.warehouseItems.length,
          documents: restored.documents.length,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 11. PRIVATE AUTHENTICATED FILE STORAGE (/api/files/:id — R2 OR LOCAL VAULT)
// =============================================================================

charityApiRouter.get('/files/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const perms = req.permissions!;
    const state = readAuthStore();
    const doc = state.documents.find((d) => d.id === req.params.id);
    if (!doc) {
      res.status(404).json({error: 'المستند المطلوب غير موجود.'});
      return;
    }

    if (doc.entityType === 'family' && !perms.canManageFamilies) {
      res.status(403).json({
        error: 'مرفوض أمنياً: لا يملك حسابك صلاحية الاطلاع على مستندات الأسر المستفيدة.',
      });
      return;
    }

    if (doc.entityType === 'project' && !perms.canManageProjects) {
      res.status(403).json({
        error: 'مرفوض أمنياً: لا يملك حسابك صلاحية الاطلاع على مستندات المشروعات الخيرية.',
      });
      return;
    }

    const buffer = await readPrivateDocumentBufferAsync(doc);
    if (!buffer) {
      res.status(404).json({error: 'تعذر العثور على ملف المستند على الخادم.'});
      return;
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    );
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});
