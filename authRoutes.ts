import crypto from 'node:crypto';
import {z} from 'zod';
import {
  DONATION_CATEGORY_LABELS_AR,
  ROLE_META,
  SUPPORT_TYPE_LABELS_AR,
  type ActivityTask,
  type AssistanceSupportType,
  type AuthSession,
  type BeneficiaryFamilyRecord,
  type CharityActivity,
  type DashboardOverviewData,
  type DashboardPeriodFilter,
  type DonationCategory,
  type DonationRecord,
  type FamiliesStatisticsSummary,
  type FinancialGovernanceSummary,
  type FinancialTransaction,
  type MonthlyAssistanceDisbursement,
  type MonthlyAssistanceSummary,
  type MonthlyFinancialPoint,
} from '../src/types/auth.ts';
import {
  buildRolePermissions,
  defaultGranularPermissionsForRole,
  defaultModulePermissionsForRole,
  formatPiastersToDecimal,
  generateRecoveryCode,
  hashPassword,
  parseMoneyToPiasters,
  signToken,
  verifyPassword,
} from './authSecurity.ts';
import {
  DEFAULT_BOARD_AUTHORIZATIONS,
  logSecurityEvent,
  readAuthStore,
  toPublicUser,
  writeAuthStore,
  type AuthDatabaseState,
  type StoredUserRecord,
} from './authStore.ts';
import {
  getCurrentMonthKey,
  requireAuth,
  requireGranular,
  requireModule,
  requireRoles,
  sendError,
  type AuthedRequest,
} from './middleware.ts';

import {
  createUniversalRouter,
  type UniversalNext,
  type UniversalRequest,
  type UniversalResponse,
} from './universalRouter.ts';

export const authApiRouter = createUniversalRouter();

function makeSession(state: AuthDatabaseState, record: StoredUserRecord): AuthSession {
  const user = toPublicUser(state, record);
  const permissions = buildRolePermissions(
    record.role,
    record.boardAuthorizations,
    record.assignedActivityId,
    record.granularPermissions,
    record.modulePermissions,
  );
  return {user, permissions};
}

function getPeriodCutoffIso(period: DashboardPeriodFilter): string | null {
  const now = new Date();
  if (period === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (period === 'quarter') {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (period === 'year') {
    return `${now.getFullYear()}-01-01`;
  }
  return null;
}

function computeFamiliesSummary(
  scopedFamilies: BeneficiaryFamilyRecord[],
  scopeLabelAr: string,
): FamiliesStatisticsSummary {
  const enrolled = scopedFamilies.filter(
    (f) =>
      f.monthlyAssistanceEnabled &&
      f.approvalStatus !== 'rejected' &&
      (f.eligibilityStatus === 'priority' || f.eligibilityStatus === 'eligible'),
  );
  const approvedCount = scopedFamilies.filter((f) => f.approvalStatus === 'approved').length;
  return {
    scopeLabelAr,
    totalFamilies: scopedFamilies.length,
    approvedFamilies: approvedCount,
    totalIndividuals: scopedFamilies.reduce((sum, f) => sum + f.membersCount, 0),
    enrolledMonthlyCount: enrolled.length,
    byEligibility: {
      priority: scopedFamilies.filter((f) => f.eligibilityStatus === 'priority').length,
      eligible: scopedFamilies.filter((f) => f.eligibilityStatus === 'eligible').length,
      pending_review: scopedFamilies.filter((f) => f.eligibilityStatus === 'pending_review').length,
      suspended: scopedFamilies.filter((f) => f.eligibilityStatus === 'suspended').length,
    },
  };
}

function computeMonthlyAssistanceSummary(
  scopedFamilies: BeneficiaryFamilyRecord[],
  scopedDisbursements: MonthlyAssistanceDisbursement[],
  scopeLabelAr: string,
): MonthlyAssistanceSummary {
  const currentMonthKey = getCurrentMonthKey();
  const enrolled = scopedFamilies.filter(
    (f) =>
      f.monthlyAssistanceEnabled &&
      f.approvalStatus !== 'rejected' &&
      (f.eligibilityStatus === 'priority' || f.eligibilityStatus === 'eligible'),
  );

  const scheduledPiasters = enrolled.reduce(
    (acc, f) => acc + parseMoneyToPiasters(f.monthlyAssistanceAmount),
    0n,
  );

  const monthDisbursements = scopedDisbursements.filter((d) => d.monthKey === currentMonthKey);
  const disbursedPiasters = monthDisbursements.reduce(
    (acc, d) => acc + parseMoneyToPiasters(d.amount),
    0n,
  );

  const avgPiasters = enrolled.length > 0 ? scheduledPiasters / BigInt(enrolled.length) : 0n;

  const supportTypes: AssistanceSupportType[] = [
    'monthly_pension',
    'food_support',
    'medical_support',
    'orphan_sponsorship',
  ];

  const bySupportType = supportTypes.map((st) => {
    const matching = enrolled.filter((f) => f.supportType === st);
    const totalP = matching.reduce(
      (acc, f) => acc + parseMoneyToPiasters(f.monthlyAssistanceAmount),
      0n,
    );
    return {
      supportType: st,
      labelAr: SUPPORT_TYPE_LABELS_AR[st],
      familiesCount: matching.length,
      monthlyTotal: formatPiastersToDecimal(totalP),
    };
  });

  return {
    scopeLabelAr,
    currency: 'EGP',
    currentMonthKey,
    scheduledMonthlyTotal: formatPiastersToDecimal(scheduledPiasters),
    disbursedCurrentMonthTotal: formatPiastersToDecimal(disbursedPiasters),
    disbursedCurrentMonthCount: monthDisbursements.length,
    averagePerEnrolledFamily: formatPiastersToDecimal(avgPiasters),
    bySupportType,
  };
}

const ARABIC_SHORT_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function computeFinancialGovernanceSummary(
  scopedDonations: DonationRecord[],
  scopedDisbursements: MonthlyAssistanceDisbursement[],
  scopedExecutedExpenses: FinancialTransaction[],
  scopeLabelAr: string,
): FinancialGovernanceSummary {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const monthKeys: Array<{monthKey: string; shortLabelAr: string; fullLabelAr: string}> = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const d = new Date(currentYear, currentMonth - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const shortName = ARABIC_SHORT_MONTHS[m] || key;
    monthKeys.push({
      monthKey: key,
      shortLabelAr: shortName,
      fullLabelAr: `${shortName} ${y}`,
    });
  }

  const periodSet = new Set(monthKeys.map((m) => m.monthKey));
  let totalDon12MPiasters = 0n;
  let totalDisb12MPiasters = 0n;

  const monthlySeries: MonthlyFinancialPoint[] = monthKeys.map((meta) => {
    const monthDon = scopedDonations.filter(
      (d) => d.monthKey === meta.monthKey && d.category !== 'in_kind',
    );
    const monthDisb = scopedDisbursements.filter((d) => d.monthKey === meta.monthKey);
    const monthFinExp = scopedExecutedExpenses.filter(
      (t) =>
        t.monthKey === meta.monthKey &&
        t.workflowStatus === 'executed' &&
        (t.txType === 'expense' || t.txType === 'aid_disbursement'),
    );

    const donPiasters = monthDon.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
    const disbPiasters =
      monthDisb.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n) +
      monthFinExp.reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n);
    totalDon12MPiasters += donPiasters;
    totalDisb12MPiasters += disbPiasters;

    return {
      monthKey: meta.monthKey,
      shortLabelAr: meta.shortLabelAr,
      fullLabelAr: meta.fullLabelAr,
      donationsTotal: formatPiastersToDecimal(donPiasters),
      donationsCount: monthDon.length,
      disbursementsTotal: formatPiastersToDecimal(disbPiasters),
      disbursementsCount: monthDisb.length + monthFinExp.length,
      netBalance: formatPiastersToDecimal(donPiasters - disbPiasters),
    };
  });

  const periodDonations = scopedDonations.filter(
    (d) => periodSet.has(d.monthKey) && d.category !== 'in_kind',
  );
  const currentPoint = monthlySeries[monthlySeries.length - 1];
  const prevPoint = monthlySeries[monthlySeries.length - 2];

  const categories: DonationCategory[] = [
    'monthly_subscription',
    'sadaqah',
    'zakat',
    'zakat_fitr',
    'general_donation',
    'campaign',
    'in_kind',
  ];

  const byCategory = categories.map((cat) => {
    const matching = scopedDonations.filter((d) => periodSet.has(d.monthKey) && d.category === cat);
    const sumP = matching.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
    return {
      category: cat,
      labelAr: DONATION_CATEGORY_LABELS_AR[cat],
      count: matching.length,
      total: formatPiastersToDecimal(sumP),
    };
  });

  return {
    scopeLabelAr,
    currency: 'EGP',
    currentMonthKey,
    totalDonations12M: formatPiastersToDecimal(totalDon12MPiasters),
    totalDisbursements12M: formatPiastersToDecimal(totalDisb12MPiasters),
    currentMonthDonations: currentPoint ? currentPoint.donationsTotal : '0.00',
    previousMonthDonations: prevPoint ? prevPoint.donationsTotal : '0.00',
    totalDonationRecordsCount: periodDonations.length,
    monthlySeries,
    byCategory,
  };
}

// =============================================================================
// 1. PUBLIC AUTH STATUS (Exposes ZERO administrative data before login)
// =============================================================================

authApiRouter.get('/auth/status', (_req, res) => {
  const state = readAuthStore();
  const hasPresident = state.users.some((u) => u.role === 'president');
  res.json({hasPresident, hasChairman: hasPresident});
});

// =============================================================================
// 2. ONE-TIME SECURE PRESIDENT ACCOUNT INITIALIZATION (SINGLE PRESIDENT ONLY)
// =============================================================================

const bootstrapPresidentSchema = z.object({
  fullName: z.string().trim().min(2, 'يرجى إدخال الاسم الكامل لرئيس مجلس الإدارة.'),
  username: z
    .string()
    .trim()
    .min(3, 'اسم المستخدم يجب أن لا يقل عن 3 أحرف.')
    .max(32, 'اسم المستخدم طويل جداً.')
    .regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم يقبل الحروف الإنجليزية والأرقام والرموز (._-) فقط.'),
  email: z.string().trim().email('يرجى إدخال بريد إلكتروني صحيح.'),
  phone: z.string().trim().optional().default(''),
  password: z.string().min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف.'),
});

function handleBootstrapPresident(req: UniversalRequest, res: UniversalResponse) {
  try {
    const state = readAuthStore();
    if (state.users.some((u) => u.role === 'president')) {
      logSecurityEvent(state, {
        actorUserId: null,
        actorName: String(req.body?.email || req.body?.username || 'مجهول'),
        actorRole: 'anonymous',
        actionCode: 'BLOCKED_DUPLICATE_PRESIDENT_BOOTSTRAP',
        summaryAr:
          'تم حظر محاولة إعادة تأسيس حساب رئيس مجلس الإدارة لوجود حساب رئيس مجلس إدارة أساسي بالفعل.',
      });
      writeAuthStore(state);
      res.status(403).json({
        error:
          'مرفوض أمنياً: تم تأسيس حساب رئيس مجلس الإدارة مسبقاً ولا يُسمح بإعادة تأسيسه أو إنشاء رئيس مجلس إدارة آخر.',
      });
      return;
    }

    const body = bootstrapPresidentSchema.parse(req.body);
    const emailNorm = body.email.toLowerCase();
    const usernameNorm = body.username.toLowerCase();

    if (
      state.users.some(
        (u) => u.email.toLowerCase() === emailNorm || u.username.toLowerCase() === usernameNorm,
      )
    ) {
      res.status(409).json({error: 'البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.'});
      return;
    }

    const now = new Date().toISOString();
    const presidentRecord: StoredUserRecord = {
      id: crypto.randomUUID(),
      fullName: body.fullName,
      username: usernameNorm,
      email: emailNorm,
      phone: body.phone,
      role: 'president',
      boardPosition: 'رئيس مجلس الإدارة',
      membershipStatus: 'active',
      assignedActivityId: null,
      boardAuthorizations: {...DEFAULT_BOARD_AUTHORIZATIONS},
      granularPermissions: defaultGranularPermissionsForRole('president'),
      modulePermissions: defaultModulePermissionsForRole('president'),
      isActive: true,
      mustChangePassword: false,
      passwordHash: hashPassword(body.password),
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    state.users.push(presidentRecord);
    logSecurityEvent(state, {
      actorUserId: presidentRecord.id,
      actorName: presidentRecord.fullName,
      actorRole: 'president',
      actionCode: 'PRESIDENT_INITIALIZED',
      summaryAr: `تم تأسيس حساب رئيس مجلس الإدارة الأساسي (${presidentRecord.fullName}) وإغلاق مسار التأسيس نهائياً.`,
    });
    writeAuthStore(state);

    const token = signToken(presidentRecord.id, presidentRecord.username, presidentRecord.tokenVersion);
    res.status(201).json({
      token,
      session: makeSession(state, presidentRecord),
    });
  } catch (err) {
    sendError(res, err);
  }
}

authApiRouter.post('/auth/bootstrap-president', handleBootstrapPresident);
authApiRouter.post('/auth/bootstrap-chairman', handleBootstrapPresident);

// Explicitly block legacy admin bootstrap endpoint
authApiRouter.post('/auth/bootstrap-admin', (_req, res) => {
  res.status(403).json({
    error: 'تم إلغاء هذا المسار؛ يُتاح فقط تأسيس حساب رئيس مجلس الإدارة لمرة واحدة عبر المسار الرسمي.',
  });
});

// =============================================================================
// 3. PUBLIC REGISTRATION PERMANENTLY DISABLED (ADMIN-ONLY PORTAL)
// =============================================================================

function blockPublicRegistration(req: UniversalRequest, res: UniversalResponse) {
  const state = readAuthStore();
  logSecurityEvent(state, {
    actorUserId: null,
    actorName: String(req.body?.email || req.body?.username || 'زائر'),
    actorRole: 'anonymous',
    actionCode: 'BLOCKED_PUBLIC_REGISTRATION',
    summaryAr: `تم حظر محاولة تسجيل عام على المسار (${req.path}) — التسجيل العام مُغلق نهائياً.`,
  });
  writeAuthStore(state);
  res.status(403).json({
    error:
      'مرفوض أمنياً: التسجيل العام غير متاح. بوابة الدخول مخصصة لإدارة الجمعية فقط، وتُنشأ حسابات المديرين حصرياً عبر رئيس مجلس الإدارة.',
  });
}

authApiRouter.post('/auth/register', blockPublicRegistration);
authApiRouter.post('/auth/register-volunteer', blockPublicRegistration);

// =============================================================================
// 4. LOGIN, ME, LOGOUT, CHANGE PASSWORD, FORGOT/RESET PASSWORD
// =============================================================================

const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم.'),
  password: z.string().min(1, 'يرجى إدخال كلمة المرور.'),
});

authApiRouter.post('/auth/login', (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const state = readAuthStore();
    const identNorm = body.identifier.toLowerCase();

    const user = state.users.find(
      (u) => u.email.toLowerCase() === identNorm || u.username.toLowerCase() === identNorm,
    );

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      logSecurityEvent(state, {
        actorUserId: user ? user.id : null,
        actorName: body.identifier,
        actorRole: user ? user.role : 'anonymous',
        actionCode: 'LOGIN_FAILED',
        summaryAr: `محاولة تسجيل دخول غير ناجحة للمعرّف (${body.identifier}).`,
      });
      writeAuthStore(state);
      res.status(401).json({
        error: 'بيانات الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني أو اسم المستخدم وكلمة المرور.',
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        error: 'هذا الحساب موقوف حالياً. يرجى مراجعة رئيس مجلس الإدارة لإعادة التفعيل.',
      });
      return;
    }

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'LOGIN_SUCCESS',
      summaryAr: `تسجيل دخول ناجح للمستخدم (${user.fullName}) بصلاحية (${ROLE_META[user.role].labelAr}).`,
    });
    writeAuthStore(state);

    const token = signToken(user.id, user.username, user.tokenVersion ?? 1);
    res.json({
      token,
      session: makeSession(state, user),
    });
  } catch (err) {
    sendError(res, err);
  }
});

authApiRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const state = readAuthStore();
  res.json(makeSession(state, req.currentUser!));
});

authApiRouter.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  const state = readAuthStore();
  const user = state.users.find((u) => u.id === req.currentUser!.id);
  if (user) {
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    user.updatedAt = new Date().toISOString();
  }
  logSecurityEvent(state, {
    actorUserId: req.currentUser!.id,
    actorName: req.currentUser!.fullName,
    actorRole: req.currentUser!.role,
    actionCode: 'LOGOUT',
    summaryAr: `تسجيل خروج المستخدم (${req.currentUser!.fullName}) وإبطال رمز الجلسة على الخادم.`,
  });
  writeAuthStore(state);
  res.json({success: true});
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'يرجى إدخال كلمة المرور الحالية.'),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب أن لا تقل عن 8 أحرف.'),
});

authApiRouter.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const state = readAuthStore();
    const user = state.users.find((u) => u.id === req.currentUser!.id);
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      res.status(400).json({error: 'كلمة المرور الحالية أو المؤقتة غير صحيحة.'});
      return;
    }
    if (verifyPassword(body.newPassword, user.passwordHash)) {
      res.status(400).json({
        error: 'كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية أو المؤقتة.',
      });
      return;
    }
    const wasForcedFirstLogin = Boolean(user.mustChangePassword);
    user.passwordHash = hashPassword(body.newPassword);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    user.updatedAt = new Date().toISOString();
    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: wasForcedFirstLogin ? 'FIRST_LOGIN_PASSWORD_CHANGED' : 'PASSWORD_CHANGED',
      summaryAr: wasForcedFirstLogin
        ? `أتمّ المستخدم (${user.fullName}) تغيير كلمة المرور المؤقتة عند أول تسجيل دخول وتفعيل كلمة مروره الشخصية مع إبطال الجلسات السابقة.`
        : `قام المستخدم (${user.fullName}) بتحديث كلمة المرور الخاصة به وإبطال الجلسات السابقة.`,
    });
    writeAuthStore(state);
    const freshToken = signToken(user.id, user.username, user.tokenVersion);
    res.json({success: true, token: freshToken, session: makeSession(state, user)});
  } catch (err) {
    sendError(res, err);
  }
});

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(2, 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم.'),
});

authApiRouter.post('/auth/forgot-password', (req, res) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const state = readAuthStore();
    const identNorm = body.identifier.toLowerCase();

    const user = state.users.find(
      (u) => u.email.toLowerCase() === identNorm || u.username.toLowerCase() === identNorm,
    );

    if (user && user.isActive) {
      for (const reqItem of state.passwordResetRequests) {
        if (reqItem.userId === user.id && !reqItem.used) {
          reqItem.used = true;
        }
      }

      const code = generateRecoveryCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

      state.passwordResetRequests.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        userFullName: user.fullName,
        username: user.username,
        email: user.email,
        code,
        expiresAt,
        used: false,
        createdAt: now.toISOString(),
      });

      logSecurityEvent(state, {
        actorUserId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        actionCode: 'PASSWORD_RESET_REQUESTED',
        summaryAr: `طلب استعادة كلمة مرور للحساب (${user.fullName} — @${user.username}). رمز التحقق متاح لدى الإدارة لمدة 30 دقيقة.`,
      });
      writeAuthStore(state);
    }

    res.json({
      message:
        'في حال وجود حساب مطابق، تم تسجيل طلب استعادة كلمة المرور بنجاح. يُرجى استلام رمز التحقق (6 أرقام) من رئيس مجلس الإدارة ثم إتمام تعيين كلمة المرور الجديدة.',
    });
  } catch (err) {
    sendError(res, err);
  }
});

const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(2, 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم.'),
  code: z.string().trim().regex(/^\d{6}$/, 'رمز الاستعادة يتكون من 6 أرقام.'),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب أن لا تقل عن 8 أحرف.'),
});

authApiRouter.post('/auth/reset-password', (req, res) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const state = readAuthStore();
    const identNorm = body.identifier.toLowerCase();

    const user = state.users.find(
      (u) => u.email.toLowerCase() === identNorm || u.username.toLowerCase() === identNorm,
    );
    if (!user || !user.isActive) {
      res.status(400).json({error: 'تعذر التحقق من رمز الاستعادة أو أن الحساب موقوف حالياً.'});
      return;
    }

    const requestRecord = state.passwordResetRequests.find(
      (r) =>
        r.userId === user.id &&
        !r.used &&
        r.code === body.code &&
        new Date(r.expiresAt).getTime() > Date.now(),
    );

    if (!requestRecord) {
      res.status(400).json({error: 'رمز الاستعادة غير صحيح أو منتهي الصلاحية.'});
      return;
    }

    requestRecord.used = true;
    user.passwordHash = hashPassword(body.newPassword);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    user.updatedAt = new Date().toISOString();

    logSecurityEvent(state, {
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      actionCode: 'PASSWORD_RESET_COMPLETED',
      summaryAr: `تمت إعادة تعيين كلمة المرور بنجاح للحساب (${user.fullName}) وإبطال الجلسات السابقة.`,
    });
    writeAuthStore(state);

    res.json({message: 'تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'});
  } catch (err) {
    sendError(res, err);
  }
});

// =============================================================================
// 5. EXECUTIVE DASHBOARD OVERVIEW WITH TIME-PERIOD FILTER (STRICTLY PERM-SCOPED)
// =============================================================================

authApiRouter.get('/dashboard/overview', requireAuth, (req: AuthedRequest, res) => {
  const state = readAuthStore();
  const user = req.currentUser!;
  const perms = req.permissions!;
  const isPresident = user.role === 'president';

  const rawPeriod = String(req.query.period || 'all');
  const period: DashboardPeriodFilter =
    rawPeriod === 'month' || rawPeriod === 'quarter' || rawPeriod === 'year' ? rawPeriod : 'all';
  const cutoffDate = getPeriodCutoffIso(period);
  const currentMonthKey = getCurrentMonthKey();

  const inPeriod = (dateStr: string) => (!cutoffDate ? true : dateStr.slice(0, 10) >= cutoffDate);

  const canSeeFamKpis = isPresident || perms.canViewFamiliesStats;
  const canSeeAssistSummary = isPresident || perms.canViewMonthlyAssistanceStats;
  const canSeeFinKpis = isPresident || perms.canViewFinancialGovernance;
  const canSeeTreasury = isPresident || perms.canViewTreasury;
  const canSeeVolunteers = isPresident || perms.canManageVolunteers;
  const canSeeActivities = isPresident || perms.canViewAllActivities;
  const canSeeTasks =
    isPresident ||
    ((perms.modulePermissions.activities || perms.modulePermissions.volunteers) &&
      perms.canViewData);

  const scopeLabel = perms.statsScopeLabelAr;

  const visibleActivities: CharityActivity[] = canSeeActivities ? state.activities : [];
  const visibleTasks: ActivityTask[] = canSeeTasks ? state.tasks : [];

  const familiesSummary: FamiliesStatisticsSummary | null = canSeeFamKpis
    ? computeFamiliesSummary(state.families, scopeLabel)
    : null;

  const monthlyAssistanceSummary: MonthlyAssistanceSummary | null = canSeeAssistSummary
    ? computeMonthlyAssistanceSummary(state.families, state.monthlyDisbursements, scopeLabel)
    : null;

  const financialGovernance: FinancialGovernanceSummary | null = canSeeFinKpis
    ? computeFinancialGovernanceSummary(
        state.donations,
        state.monthlyDisbursements,
        state.financialTransactions,
        scopeLabel,
      )
    : null;

  const recentFinancialTransactions: FinancialTransaction[] = canSeeTreasury
    ? state.financialTransactions.slice(0, 8)
    : [];

  const periodCashDonations = state.donations.filter(
    (d) => d.category !== 'in_kind' && inPeriod(d.donationDate),
  );
  const periodDonationsPiasters = periodCashDonations.reduce(
    (acc, d) => acc + parseMoneyToPiasters(d.amount),
    0n,
  );

  const periodExecutedFinTx = state.financialTransactions.filter(
    (t) =>
      t.workflowStatus === 'executed' &&
      (t.txType === 'expense' || t.txType === 'aid_disbursement') &&
      inPeriod(t.txDate),
  );
  const periodDisbursements = state.monthlyDisbursements.filter((d) => inPeriod(d.recordedAt));

  const periodExpensesPiasters =
    periodExecutedFinTx.reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n) +
    periodDisbursements.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);

  const totalTreasuryPiasters = state.treasuryAccounts
    .filter((a) => a.isActive)
    .reduce((acc, a) => acc + parseMoneyToPiasters(a.currentBalance), 0n);

  const pendingTxPiasters = state.financialTransactions
    .filter(
      (t) =>
        (t.workflowStatus === 'recorded' || t.workflowStatus === 'approved') &&
        (t.txType === 'expense' || t.txType === 'aid_disbursement'),
    )
    .reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n);

  const paidThisMonthSet = new Set(
    state.monthlyDisbursements
      .filter((d) => d.monthKey === currentMonthKey)
      .map((d) => d.familyId),
  );
  const unpaidActivePensionsPiasters = state.pensionPlans
    .filter((p) => p.status === 'active' && !paidThisMonthSet.has(p.familyId))
    .reduce((acc, p) => acc + parseMoneyToPiasters(p.monthlyAmount), 0n);

  const pendingApprovalsCount = state.financialTransactions.filter(
    (t) => t.workflowStatus === 'recorded' || t.workflowStatus === 'approved',
  ).length;

  const pendingResets = state.passwordResetRequests.filter(
    (r) => !r.used && new Date(r.expiresAt).getTime() > Date.now(),
  ).length;

  const volunteersCount = state.volunteers.filter((v) => v.isActive).length;

  const overview: DashboardOverviewData = {
    role: user.role,
    period,
    statsScopeLabelAr: scopeLabel,
    executiveKpis: {
      totalDonations: canSeeFinKpis ? formatPiastersToDecimal(periodDonationsPiasters) : null,
      totalExpenses: canSeeFinKpis ? formatPiastersToDecimal(periodExpensesPiasters) : null,
      currentTreasuryBalance: canSeeTreasury
        ? formatPiastersToDecimal(totalTreasuryPiasters)
        : null,
      beneficiaryFamiliesCount: canSeeFamKpis
        ? state.families.filter((f) => f.approvalStatus === 'approved').length
        : null,
      registeredFamiliesCount: canSeeFamKpis ? state.families.length : null,
      volunteersCount: canSeeVolunteers ? volunteersCount : null,
      donationsCountInPeriod: canSeeFinKpis ? periodCashDonations.length : null,
      executedAssistancesCount: canSeeAssistSummary
        ? periodDisbursements.length +
          periodExecutedFinTx.filter((t) => t.txType === 'aid_disbursement').length
        : null,
      pendingObligationsTotal: canSeeTreasury
        ? formatPiastersToDecimal(pendingTxPiasters + unpaidActivePensionsPiasters)
        : null,
      pendingApprovalsCount: canSeeTreasury ? pendingApprovalsCount : null,
    },
    stats: {
      totalUsers: perms.canManageUsers ? state.users.length : null,
      activeUsers: perms.canManageUsers ? state.users.filter((u) => u.isActive).length : null,
      pendingPasswordResets: perms.canManageUsers ? pendingResets : null,
      visibleActivitiesCount: visibleActivities.length,
      visibleTasksCount: visibleTasks.length,
      myParticipationsCount: 0,
    },
    familiesSummary,
    monthlyAssistanceSummary,
    financialGovernance,
    recentFinancialTransactions,
    recentActivities: visibleActivities.slice(0, 5),
    assignedActivity: null,
    availableActivities: canSeeActivities
      ? state.activities.map((a) => ({id: a.id, name: a.name}))
      : [],
    recentLogs: perms.canViewSecurityLogs ? state.auditLogs.slice(0, 12) : [],
  };

  res.json(overview);
});

// =============================================================================
// 6. MANAGER ACCOUNTS & PERMISSION CONTROL (PRESIDENT ONLY)
// =============================================================================

authApiRouter.get(
  '/admin/users',
  requireAuth,
  requireRoles(['president']),
  (_req, res) => {
    const state = readAuthStore();
    const activeResetRequests = state.passwordResetRequests.filter(
      (r) => !r.used && new Date(r.expiresAt).getTime() > Date.now(),
    );
    res.json({
      users: state.users.map((u) => toPublicUser(state, u)),
      activities: state.activities,
      passwordResetRequests: activeResetRequests,
    });
  },
);

const granularPermSchema = z.object({
  canViewData: z.boolean(),
  canAddData: z.boolean(),
  canEditData: z.boolean(),
  canDeleteData: z.boolean(),
  canApproveTransactions: z.boolean(),
  canExecuteFinancial: z.boolean(),
  canExportReports: z.boolean(),
});

const modulePermSchema = z.object({
  families: z.boolean(),
  pensions: z.boolean(),
  donations: z.boolean(),
  finance: z.boolean(),
  projects: z.boolean(),
  warehouse: z.boolean(),
  volunteers: z.boolean(),
  activities: z.boolean(),
  reports: z.boolean(),
});

const adminCreateManagerSchema = z.object({
  fullName: z.string().trim().min(2, 'يرجى إدخال الاسم الكامل للمدير.'),
  username: z
    .string()
    .trim()
    .min(3, 'اسم المستخدم يجب أن لا يقل عن 3 أحرف.')
    .max(32)
    .regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم يقبل الحروف الإنجليزية والأرقام والرموز (._-) فقط.'),
  email: z.string().trim().email('يرجى إدخال بريد إلكتروني صحيح.'),
  phone: z.string().trim().optional().default(''),
  password: z.string().min(8, 'كلمة المرور المؤقتة يجب أن لا تقل عن 8 أحرف.'),
  role: z.string().optional().default('manager'),
  boardPosition: z.string().trim().optional().default('مدير'),
  granularPermissions: granularPermSchema.partial().optional(),
  modulePermissions: modulePermSchema.partial().optional(),
});

authApiRouter.post(
  '/admin/users',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const body = adminCreateManagerSchema.parse(req.body);
      const state = readAuthStore();

      // Strictly block creating a second President or any non-manager role
      if (body.role !== 'manager') {
        logSecurityEvent(state, {
          actorUserId: req.currentUser!.id,
          actorName: req.currentUser!.fullName,
          actorRole: req.currentUser!.role,
          actionCode: 'BLOCKED_UNAUTHORIZED_ROLE_CREATION',
          summaryAr: `تم رفض محاولة إنشاء حساب بدور غير مسموح (${body.role}) — يُسمح بإنشاء حسابات «مدير» فقط.`,
        });
        writeAuthStore(state);
        res.status(403).json({
          error:
            'مرفوض أمنياً: يوجد حساب رئيس مجلس إدارة واحد أساسي فقط. يمكن إنشاء حسابات «مدير» فقط.',
        });
        return;
      }

      const emailNorm = body.email.toLowerCase();
      const usernameNorm = body.username.toLowerCase();

      if (state.users.some((u) => u.email.toLowerCase() === emailNorm)) {
        res.status(409).json({error: 'البريد الإلكتروني مستخدم بالفعل.'});
        return;
      }
      if (state.users.some((u) => u.username.toLowerCase() === usernameNorm)) {
        res.status(409).json({error: 'اسم المستخدم مستخدم بالفعل.'});
        return;
      }

      // New manager strictly defaults to ZERO granular & ZERO module permissions unless President explicitly grants them
      const baseG = defaultGranularPermissionsForRole('manager');
      const pg = body.granularPermissions;
      const granularPermissions = {
        canViewData: pg?.canViewData ?? baseG.canViewData,
        canAddData: pg?.canAddData ?? baseG.canAddData,
        canEditData: pg?.canEditData ?? baseG.canEditData,
        canDeleteData: pg?.canDeleteData ?? baseG.canDeleteData,
        canApproveTransactions: pg?.canApproveTransactions ?? baseG.canApproveTransactions,
        canExecuteFinancial: pg?.canExecuteFinancial ?? baseG.canExecuteFinancial,
        canExportReports: pg?.canExportReports ?? baseG.canExportReports,
      };

      const baseM = defaultModulePermissionsForRole('manager');
      const pm = body.modulePermissions;
      const modulePermissions = {
        families: pm?.families ?? baseM.families,
        pensions: pm?.pensions ?? baseM.pensions,
        donations: pm?.donations ?? baseM.donations,
        finance: pm?.finance ?? baseM.finance,
        projects: pm?.projects ?? baseM.projects,
        warehouse: pm?.warehouse ?? baseM.warehouse,
        volunteers: pm?.volunteers ?? baseM.volunteers,
        activities: pm?.activities ?? baseM.activities,
        reports: pm?.reports ?? baseM.reports,
      };

      const now = new Date().toISOString();
      const newManager: StoredUserRecord = {
        id: crypto.randomUUID(),
        fullName: body.fullName,
        username: usernameNorm,
        email: emailNorm,
        phone: body.phone,
        role: 'manager',
        boardPosition: body.boardPosition || 'مدير',
        membershipStatus: 'active',
        assignedActivityId: null,
        boardAuthorizations: {
          canViewActivities: false,
          canViewTasks: false,
          canViewExecutiveSummary: false,
          canViewFamiliesSummary: false,
        },
        granularPermissions,
        modulePermissions,
        isActive: true,
        // Mandatory first-login temporary password change for every newly created Manager
        mustChangePassword: true,
        passwordHash: hashPassword(body.password),
        tokenVersion: 1,
        createdAt: now,
        updatedAt: now,
      };

      state.users.unshift(newManager);
      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'MANAGER_CREATED_BY_PRESIDENT',
        summaryAr: `أنشأ رئيس مجلس الإدارة (${req.currentUser!.fullName}) حساب مدير جديد (${newManager.fullName} — @${newManager.username}) بكلمة مرور مؤقتة واجبة التغيير عند أول دخول.`,
      });
      writeAuthStore(state);

      res.status(201).json({user: toPublicUser(state, newManager)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  email: z.string().trim().email('يرجى إدخال بريد إلكتروني صحيح.').optional(),
  phone: z.string().trim().optional(),
  role: z.string().optional(),
  boardPosition: z.string().trim().optional(),
  membershipStatus: z.enum(['active', 'inactive', 'honorary']).optional(),
  isActive: z.boolean().optional(),
  granularPermissions: granularPermSchema.partial().optional(),
  modulePermissions: modulePermSchema.partial().optional(),
});

authApiRouter.patch(
  '/admin/users/:id',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const body = adminUpdateUserSchema.parse(req.body);
      const state = readAuthStore();
      const target = state.users.find((u) => u.id === req.params.id);
      if (!target) {
        res.status(404).json({error: 'الحساب المطلوب غير موجود.'});
        return;
      }

      // Never allow creating/promoting a second President or demoting/deactivating the primary President
      if (body.role !== undefined && body.role !== target.role) {
        res.status(403).json({
          error:
            'مرفوض أمنياً: لا يمكن تغيير نوع الحساب أو ترقية أي حساب إلى رئيس مجلس الإدارة. يوجد حساب رئيس مجلس إدارة واحد أساسي فقط.',
        });
        return;
      }

      if (body.email !== undefined) {
        const emailNorm = body.email.toLowerCase();
        if (
          emailNorm !== target.email.toLowerCase() &&
          state.users.some((u) => u.id !== target.id && u.email.toLowerCase() === emailNorm)
        ) {
          res.status(409).json({error: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر.'});
          return;
        }
        target.email = emailNorm;
      }

      if (target.role === 'president') {
        if (
          body.isActive === false ||
          body.granularPermissions !== undefined ||
          body.modulePermissions !== undefined
        ) {
          res.status(403).json({
            error:
              'محظور أمنياً: حساب رئيس مجلس الإدارة الأساسي محمي ولا يمكن إيقافه أو تقليص صلاحياته.',
          });
          return;
        }
        if (body.fullName !== undefined) target.fullName = body.fullName;
        if (body.phone !== undefined) target.phone = body.phone;
        if (body.boardPosition !== undefined) target.boardPosition = body.boardPosition;
        target.updatedAt = new Date().toISOString();
        logSecurityEvent(state, {
          actorUserId: req.currentUser!.id,
          actorName: req.currentUser!.fullName,
          actorRole: req.currentUser!.role,
          actionCode: 'PRESIDENT_PROFILE_UPDATED',
          summaryAr: `حدّث رئيس مجلس الإدارة (${target.fullName}) بيانات ملفه الإداري.`,
        });
        writeAuthStore(state);
        res.json({user: toPublicUser(state, target)});
        return;
      }

      // Target is a manager
      if (body.fullName !== undefined) target.fullName = body.fullName;
      if (body.phone !== undefined) target.phone = body.phone;
      if (body.boardPosition !== undefined) target.boardPosition = body.boardPosition;
      if (body.membershipStatus !== undefined) target.membershipStatus = body.membershipStatus;
      if (body.isActive !== undefined) {
        if (target.isActive && body.isActive === false) {
          target.tokenVersion = (target.tokenVersion ?? 1) + 1;
        }
        target.isActive = body.isActive;
      }

      if (body.granularPermissions !== undefined) {
        const base = target.granularPermissions ?? defaultGranularPermissionsForRole('manager');
        const p = body.granularPermissions;
        target.granularPermissions = {
          canViewData: p.canViewData ?? base.canViewData,
          canAddData: p.canAddData ?? base.canAddData,
          canEditData: p.canEditData ?? base.canEditData,
          canDeleteData: p.canDeleteData ?? base.canDeleteData,
          canApproveTransactions: p.canApproveTransactions ?? base.canApproveTransactions,
          canExecuteFinancial: p.canExecuteFinancial ?? base.canExecuteFinancial,
          canExportReports: p.canExportReports ?? base.canExportReports,
        };
      }

      if (body.modulePermissions !== undefined) {
        const base = target.modulePermissions ?? defaultModulePermissionsForRole('manager');
        const m = body.modulePermissions;
        target.modulePermissions = {
          families: m.families ?? base.families,
          pensions: m.pensions ?? base.pensions,
          donations: m.donations ?? base.donations,
          finance: m.finance ?? base.finance,
          projects: m.projects ?? base.projects,
          warehouse: m.warehouse ?? base.warehouse,
          volunteers: m.volunteers ?? base.volunteers,
          activities: m.activities ?? base.activities,
          reports: m.reports ?? base.reports,
        };
      }

      target.updatedAt = new Date().toISOString();

      const activeModulesCount = Object.values(target.modulePermissions || {}).filter(Boolean).length;
      const activeActionsCount = Object.values(target.granularPermissions || {}).filter(Boolean).length;
      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'MANAGER_UPDATED_BY_PRESIDENT',
        summaryAr: `حدّث رئيس مجلس الإدارة (${req.currentUser!.fullName}) حساب المدير (${target.fullName} — الحالة: ${target.isActive ? 'نشط' : 'موقوف'} · الأقسام المفعّلة: ${activeModulesCount}/9 · الصلاحيات الإجرائية: ${activeActionsCount}/7).`,
      });
      writeAuthStore(state);

      res.json({user: toPublicUser(state, target)});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// President-only: Issue a new temporary password for a Manager (forces change on next login + revokes old tokens)
const resetTempPasswordSchema = z.object({
  temporaryPassword: z.string().min(8, 'كلمة المرور المؤقتة يجب أن لا تقل عن 8 أحرف.'),
});

authApiRouter.post(
  '/admin/users/:id/reset-temp-password',
  requireAuth,
  requireRoles(['president']),
  (req: AuthedRequest, res) => {
    try {
      const body = resetTempPasswordSchema.parse(req.body);
      const state = readAuthStore();
      const target = state.users.find((u) => u.id === req.params.id);
      if (!target) {
        res.status(404).json({error: 'الحساب المطلوب غير موجود.'});
        return;
      }
      if (target.role === 'president') {
        res.status(403).json({
          error:
            'لا يُسمح بإصدار كلمة مرور مؤقتة لحساب رئيس مجلس الإدارة عبر هذا المسار؛ يمكن للرئيس تغيير كلمة مروره من ملفه الشخصي.',
        });
        return;
      }

      target.passwordHash = hashPassword(body.temporaryPassword);
      target.mustChangePassword = true;
      target.tokenVersion = (target.tokenVersion ?? 1) + 1;
      target.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'MANAGER_TEMP_PASSWORD_ISSUED',
        summaryAr: `أصدر رئيس مجلس الإدارة (${req.currentUser!.fullName}) كلمة مرور مؤقتة جديدة للمدير (${target.fullName} — @${target.username}) مع إبطال جلساته السابقة وإلزامه بالتغيير عند أول دخول.`,
      });
      writeAuthStore(state);

      res.json({
        user: toPublicUser(state, target),
        message:
          'تم تعيين كلمة المرور المؤقتة بنجاح وإبطال الجلسات السابقة. سيُطلب من المدير تغييرها فور تسجيل الدخول.',
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

// President-only deletion of Manager accounts (strictly protects President account & preserves immutable Audit Log)
authApiRouter.delete(
  '/admin/users/:id',
  requireAuth,
  (req: AuthedRequest, res) => {
    const state = readAuthStore();
    const actor = req.currentUser!;
    const targetIdx = state.users.findIndex((u) => u.id === req.params.id);
    const target = targetIdx >= 0 ? state.users[targetIdx] : null;

    if (actor.role !== 'president') {
      logSecurityEvent(state, {
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        actionCode: 'BLOCKED_UNAUTHORIZED_USER_DELETION',
        summaryAr: `منع خادمي لمحاولة حذف حساب إداري بواسطة المدير (${actor.fullName}).`,
      });
      writeAuthStore(state);
      res.status(403).json({
        error: 'مرفوض أمنياً: لا يملك المدير أي صلاحية لحذف أو تعطيل الحسابات الإدارية.',
      });
      return;
    }

    if (!target) {
      res.status(404).json({error: 'الحساب المطلوب غير موجود.'});
      return;
    }

    if (target.role === 'president') {
      logSecurityEvent(state, {
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        actionCode: 'BLOCKED_PRESIDENT_DELETION',
        summaryAr: 'محاولة محظورة لحذف حساب رئيس مجلس الإدارة الأساسي — الحساب محمي بصورة دائمة.',
      });
      writeAuthStore(state);
      res.status(403).json({
        error: 'محظور أمنياً: حساب رئيس مجلس الإدارة الأساسي محمي بصورة دائمة ولا يمكن حذفه.',
      });
      return;
    }

    // Permanently remove Manager account while preserving historical Audit Logs & financial/operational snapshots
    state.users.splice(targetIdx, 1);
    state.passwordResetRequests = state.passwordResetRequests.filter((r) => r.userId !== target.id);
    for (const act of state.activities) {
      if (act.managerUserId === target.id) {
        act.managerUserId = null;
      }
    }

    logSecurityEvent(state, {
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      actionCode: 'MANAGER_DELETED_BY_PRESIDENT',
      summaryAr: `حذف رئيس مجلس الإدارة (${actor.fullName}) حساب المدير (${target.fullName} — @${target.username}) نهائياً مع إبطال جلساته وحفظ كافة السجلات التاريخية وسجل التدقيق.`,
    });
    writeAuthStore(state);

    res.json({success: true, deletedUserId: target.id});
  },
);

// =============================================================================
// 7. ACTIVITIES (Strictly Module & Permission Enforced on Server)
// =============================================================================

authApiRouter.get(
  '/activities',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('activities', 'الأنشطة التشغيلية'),
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    const managers = state.users
      .filter((u) => u.isActive && u.role === 'manager')
      .map((u) => ({id: u.id, fullName: u.fullName, username: u.username}));
    res.json({activities: state.activities, managers});
  },
);

const createActivitySchema = z.object({
  name: z.string().trim().min(2, 'يرجى إدخال اسم النشاط.'),
  description: z.string().trim().min(4, 'يرجى إدخال وصف واضح للنشاط.'),
  managerUserId: z.string().nullable().optional().default(null),
  status: z.enum(['active', 'planned', 'completed']).default('active'),
});

authApiRouter.post(
  '/activities',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('activities', 'الأنشطة التشغيلية'),
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const body = createActivitySchema.parse(req.body);
      const state = readAuthStore();
      let manager: StoredUserRecord | null = null;
      if (body.managerUserId) {
        manager =
          state.users.find((u) => u.id === body.managerUserId && u.isActive) || null;
        if (!manager) {
          res.status(400).json({error: 'المدير المختار للإشراف غير موجود أو غير نشط.'});
          return;
        }
      }

      const now = new Date().toISOString();
      const activity: CharityActivity = {
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description,
        managerUserId: manager ? manager.id : null,
        managerName: manager ? manager.fullName : null,
        status: body.status,
        createdBy: req.currentUser!.id,
        createdByName: req.currentUser!.fullName,
        createdAt: now,
        updatedAt: now,
      };
      state.activities.unshift(activity);

      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'ACTIVITY_CREATED',
        summaryAr: `إنشاء نشاط جديد (${activity.name})${manager ? ` بإشراف (${manager.fullName})` : ''}.`,
      });
      writeAuthStore(state);
      res.status(201).json({activity});
    } catch (err) {
      sendError(res, err);
    }
  },
);

const updateActivitySchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().min(4).optional(),
  status: z.enum(['active', 'planned', 'completed']).optional(),
  managerUserId: z.string().nullable().optional(),
});

authApiRouter.patch(
  '/activities/:id',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('activities', 'الأنشطة التشغيلية'),
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const body = updateActivitySchema.parse(req.body);
      const state = readAuthStore();
      const activity = state.activities.find((a) => a.id === req.params.id);
      if (!activity) {
        res.status(404).json({error: 'النشاط غير موجود.'});
        return;
      }

      if (body.name !== undefined) activity.name = body.name;
      if (body.description !== undefined) activity.description = body.description;
      if (body.status !== undefined) activity.status = body.status;

      if (body.managerUserId !== undefined) {
        if (body.managerUserId === null) {
          activity.managerUserId = null;
          activity.managerName = null;
        } else {
          const mgr = state.users.find((u) => u.id === body.managerUserId && u.isActive);
          if (!mgr) {
            res.status(400).json({error: 'المدير المختار غير صالح.'});
            return;
          }
          activity.managerUserId = mgr.id;
          activity.managerName = mgr.fullName;
        }
      }
      activity.updatedAt = new Date().toISOString();

      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'ACTIVITY_UPDATED',
        summaryAr: `تحديث بيانات النشاط (${activity.name}).`,
      });
      writeAuthStore(state);
      res.json({activity});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 8. TASKS MANAGEMENT (CHAIRMAN & AUTHORIZED MANAGERS ONLY)
// =============================================================================

function requireActivitiesOrVolunteersModule(
  req: AuthedRequest,
  res: UniversalResponse,
  next: UniversalNext,
) {
  if (req.currentUser?.role === 'president') {
    next();
    return;
  }
  const mp = req.permissions?.modulePermissions;
  if (!mp || (!mp.activities && !mp.volunteers)) {
    res.status(403).json({
      error: 'مرفوض أمنياً: لم يتم منح حسابك صلاحية الوصول إلى قسم الأنشطة أو المتطوعين.',
    });
    return;
  }
  next();
}

authApiRouter.get(
  '/tasks',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireActivitiesOrVolunteersModule,
  requireGranular('canViewData', 'عرض البيانات'),
  (_req: AuthedRequest, res) => {
    const state = readAuthStore();
    res.json({tasks: state.tasks});
  },
);

const createTaskSchema = z.object({
  activityId: z.string().min(1, 'يرجى اختيار النشاط المرتبط بالمهمة.'),
  title: z.string().trim().min(2, 'يرجى إدخال عنوان المهمة.'),
  description: z.string().trim().min(3, 'يرجى إدخال وصف المهمة.'),
  dueDate: z.string().nullable().optional().default(null),
  visibleToBoard: z.boolean().default(true),
  openForVolunteers: z.boolean().default(true),
  assignedVolunteerIds: z.array(z.string()).optional().default([]),
});

authApiRouter.post(
  '/tasks',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireActivitiesOrVolunteersModule,
  requireGranular('canAddData', 'إضافة البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const body = createTaskSchema.parse(req.body);
      const state = readAuthStore();
      const activity = state.activities.find((a) => a.id === body.activityId);
      if (!activity) {
        res.status(400).json({error: 'النشاط المختار غير موجود.'});
        return;
      }

      const task: ActivityTask = {
        id: crypto.randomUUID(),
        activityId: activity.id,
        activityName: activity.name,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
        status: 'open',
        visibleToBoard: body.visibleToBoard,
        openForVolunteers: body.openForVolunteers,
        assignedVolunteerIds: body.assignedVolunteerIds,
        participantIds: [],
        participantNames: [],
        createdBy: req.currentUser!.id,
        createdByName: req.currentUser!.fullName,
        createdAt: new Date().toISOString(),
      };

      state.tasks.unshift(task);
      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'TASK_CREATED',
        summaryAr: `إضافة مهمة جديدة (${task.title}) ضمن نشاط (${activity.name}).`,
      });
      writeAuthStore(state);
      res.status(201).json({task});
    } catch (err) {
      sendError(res, err);
    }
  },
);

authApiRouter.patch(
  '/tasks/:id/status',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireActivitiesOrVolunteersModule,
  requireGranular('canEditData', 'تعديل البيانات'),
  (req: AuthedRequest, res) => {
    try {
      const body = z.object({status: z.enum(['open', 'in_progress', 'completed'])}).parse(req.body);
      const state = readAuthStore();
      const task = state.tasks.find((t) => t.id === req.params.id);
      if (!task) {
        res.status(404).json({error: 'المهمة غير موجودة.'});
        return;
      }
      task.status = body.status;
      logSecurityEvent(state, {
        actorUserId: req.currentUser!.id,
        actorName: req.currentUser!.fullName,
        actorRole: req.currentUser!.role,
        actionCode: 'TASK_STATUS_UPDATED',
        summaryAr: `تحديث حالة المهمة (${task.title}) إلى (${task.status}).`,
      });
      writeAuthStore(state);
      res.json({task});
    } catch (err) {
      sendError(res, err);
    }
  },
);

// =============================================================================
// 9. IMMUTABLE SECURITY & GOVERNANCE AUDIT LOGS (CHAIRMAN ONLY)
// =============================================================================

authApiRouter.get(
  '/security/logs',
  requireAuth,
  requireRoles(['president']),
  (_req, res) => {
    const state = readAuthStore();
    res.json({logs: state.auditLogs.slice(0, 200)});
  },
);
