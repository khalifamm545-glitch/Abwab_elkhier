import type {
  UniversalNext,
  UniversalRequest,
  UniversalResponse,
} from './universalRouter.ts';
import {z} from 'zod';
import {
  FUND_POOL_LABELS_AR,
  ROLE_META,
  type AuthUser,
  type DonationCategory,
  type FinancialPurposeCategory,
  type FundPoolType,
  type ManagerModulePermissions,
  type RolePermissionMatrix,
  type TreasuryAccount,
  type UserGranularPermissions,
  type UserRole,
} from '../src/types/auth.ts';
import {
  buildRolePermissions,
  formatPiastersToDecimal,
  parseMoneyToPiasters,
  verifyToken,
} from './authSecurity.ts';
import {
  logSecurityEvent,
  readAuthStore,
  toPublicUser,
  writeAuthStore,
  type StoredUserRecord,
} from './authStore.ts';

export interface AuthedRequest extends UniversalRequest {
  currentUser?: StoredUserRecord;
  publicUser?: AuthUser;
  permissions?: RolePermissionMatrix;
}

export function sendError(
  res: UniversalResponse,
  err: unknown,
  fallback = 'حدث خطأ غير متوقع في الخادم.',
) {
  if (err instanceof z.ZodError) {
    res.status(400).json({error: err.issues[0]?.message || 'يرجى مراجعة البيانات المدخلة.'});
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({error: err.message});
    return;
  }
  res.status(500).json({error: fallback});
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function listMonthKeysRange(startMonthKey: string, endMonthKey: string): string[] {
  const startMatch = /^(\d{4})-(\d{2})$/.exec(startMonthKey);
  const endMatch = /^(\d{4})-(\d{2})$/.exec(endMonthKey);
  if (!startMatch || !endMatch) return [];
  let y = Number(startMatch[1]);
  let m = Number(startMatch[2]);
  const endY = Number(endMatch[1]);
  const endM = Number(endMatch[2]);
  const keys: string[] = [];
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 120) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return keys;
}

export function requireAuth(
  req: AuthedRequest,
  res: UniversalResponse,
  next: UniversalNext,
) {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  let token: string | null = null;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (queryToken) {
    token = queryToken.trim();
  }

  if (!token) {
    res.status(401).json({error: 'يرجى تسجيل الدخول أولاً للوصول إلى النظام.'});
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({error: 'انتهت صلاحية جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.'});
    return;
  }

  const state = readAuthStore();
  const userRecord = state.users.find((u) => u.id === payload.sub);
  if (!userRecord) {
    res.status(401).json({error: 'الحساب غير موجود في النظام.'});
    return;
  }
  if (!userRecord.isActive) {
    res.status(403).json({error: 'تم تعطيل هذا الحساب من قِبل الإدارة.'});
    return;
  }
  const expectedVer = userRecord.tokenVersion ?? 1;
  const tokenVer = typeof payload.ver === 'number' ? payload.ver : 1;
  if (tokenVer !== expectedVer) {
    res.status(401).json({error: 'تم إنهاء هذه الجلسة أمنياً. يرجى تسجيل الدخول مرة أخرى.'});
    return;
  }

  if (userRecord.mustChangePassword) {
    const fullPath = `${req.baseUrl}${req.path}`;
    const allowedWhileMustChange =
      (req.method === 'GET' && fullPath === '/api/auth/me') ||
      (req.method === 'POST' &&
        (fullPath === '/api/auth/change-password' || fullPath === '/api/auth/logout'));
    if (!allowedWhileMustChange) {
      res.status(403).json({
        error:
          'مطلوب أمنياً: يجب تغيير كلمة المرور المؤقتة أولاً قبل الوصول إلى أي قسم في النظام.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      return;
    }
  }

  req.currentUser = userRecord;
  req.publicUser = toPublicUser(state, userRecord);
  req.permissions = buildRolePermissions(
    userRecord.role,
    userRecord.boardAuthorizations,
    userRecord.assignedActivityId,
    userRecord.granularPermissions,
    userRecord.modulePermissions,
  );
  next();
}

export function requireRoles(allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: UniversalResponse, next: UniversalNext) => {
    const user = req.currentUser;
    if (!user || !allowedRoles.includes(user.role)) {
      const state = readAuthStore();
      if (user) {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'ACCESS_DENIED',
          summaryAr: `رفض خادمي لمحاولة وصول غير مصرح بها إلى (${req.method} ${req.path}) بدور (${ROLE_META[user.role].labelAr}).`,
        });
        writeAuthStore(state);
      }
      res.status(403).json({
        error: 'مرفوض أمنياً: هذه الصلاحية محصورة في رئيس مجلس الإدارة فقط.',
      });
      return;
    }
    next();
  };
}

export function requireModule(mod: keyof ManagerModulePermissions, labelAr: string) {
  return (req: AuthedRequest, res: UniversalResponse, next: UniversalNext) => {
    const user = req.currentUser;
    const perms = req.permissions;
    if (user?.role === 'president') {
      next();
      return;
    }
    if (!perms || !perms.modulePermissions[mod]) {
      const state = readAuthStore();
      if (user) {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'MODULE_ACCESS_DENIED',
          summaryAr: `رفض خادمي لمحاولة دخول قسم (${labelAr}) غير المصرّح به للمدير (${user.fullName}).`,
        });
        writeAuthStore(state);
      }
      res.status(403).json({
        error: `مرفوض أمنياً: لم يتم منح حسابك صلاحية الوصول إلى قسم «${labelAr}». يرجى مراجعة رئيس مجلس الإدارة.`,
      });
      return;
    }
    next();
  };
}

export function requireGranular(flag: keyof UserGranularPermissions, labelAr: string) {
  return (req: AuthedRequest, res: UniversalResponse, next: UniversalNext) => {
    const perms = req.permissions;
    const user = req.currentUser;
    if (user?.role === 'president') {
      next();
      return;
    }
    if (!perms || !perms[flag]) {
      const state = readAuthStore();
      if (user) {
        logSecurityEvent(state, {
          actorUserId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          actionCode: 'PERMISSION_DENIED',
          summaryAr: `رفض خادمي لعدم توفر صلاحية (${labelAr}) عند محاولة (${req.method} ${req.path}).`,
        });
        writeAuthStore(state);
      }
      res.status(403).json({
        error: `مرفوض أمنياً: حسابك لا يملك صلاحية «${labelAr}». يرجى مراجعة رئيس مجلس الإدارة.`,
      });
      return;
    }
    next();
  };
}

export function mapDonationCategoryToFundPool(
  category: DonationCategory,
  hasProject: boolean,
): FundPoolType {
  if (category === 'zakat') return 'zakat_mal';
  if (category === 'zakat_fitr') return 'zakat_fitr';
  if (category === 'sadaqah') return 'sadaqah';
  if (category === 'campaign' || hasProject) return 'project_restricted';
  return 'general';
}

/**
 * Strict Sharia & Financial Governance Fund Segregation Enforcement:
 * Prevents spending Zakat, Zakat al-Fitr, Sadaqah, or Project-restricted funds on incompatible purposes.
 */
export function assertFundPurposeCompatibility(
  fundType: FundPoolType,
  purposeCategory: FinancialPurposeCategory,
  projectId: string | null,
): void {
  if (purposeCategory === 'account_transfer') return;

  if (fundType === 'zakat_mal') {
    const allowed: FinancialPurposeCategory[] = [
      'zakat_beneficiaries',
      'debt_relief',
      'medical_aid',
      'food_aid',
      'marriage_aid',
      'charity_aid',
    ];
    if (!allowed.includes(purposeCategory)) {
      throw new Error(
        'مخالفة لضوابط الفصل المالي الشرعي: لا يجوز الصرف من «صندوق زكاة المال» إلا على مصارف الزكاة الشرعية والمساعدات المستحقة، ويُمنع الصرف منه على المصروفات الإدارية أو زكاة الفطر.',
      );
    }
  } else if (fundType === 'zakat_fitr') {
    const allowed: FinancialPurposeCategory[] = ['zakat_fitr_beneficiaries', 'food_aid'];
    if (!allowed.includes(purposeCategory)) {
      throw new Error(
        'مخالفة لضوابط الفصل المالي الشرعي: لا يجوز الصرف من «صندوق زكاة الفطر» إلا لمصارف زكاة الفطر والإطعام المستحق فقط.',
      );
    }
  } else if (fundType === 'sadaqah') {
    if (purposeCategory === 'administrative') {
      throw new Error(
        'مخالفة لضوابط الفصل المالي: لا يجوز الصرف من «صندوق الصدقات» على المصروفات الإدارية والتشغيلية.',
      );
    }
  } else if (fundType === 'project_restricted') {
    if (purposeCategory !== 'project_expense' || !projectId) {
      throw new Error(
        'مخالفة لضوابط التخصيص المالي: أموال التبرعات المخصصة للمشروعات تُصرف حصراً على بند «تنفيذ مشروع خيري» مع تحديد المشروع المخصص له.',
      );
    }
  }
}

export function creditTreasuryAccount(
  account: TreasuryAccount,
  fundType: FundPoolType,
  amountStr: string,
): void {
  const delta = parseMoneyToPiasters(amountStr);
  const currentTotal = parseMoneyToPiasters(account.currentBalance);
  const currentFund = parseMoneyToPiasters(account.fundBalances[fundType] || '0.00');
  account.currentBalance = formatPiastersToDecimal(currentTotal + delta);
  account.fundBalances[fundType] = formatPiastersToDecimal(currentFund + delta);
  account.updatedAt = new Date().toISOString();
}

export function debitTreasuryAccount(
  account: TreasuryAccount,
  fundType: FundPoolType,
  amountStr: string,
): void {
  const delta = parseMoneyToPiasters(amountStr);
  const currentTotal = parseMoneyToPiasters(account.currentBalance);
  const currentFund = parseMoneyToPiasters(account.fundBalances[fundType] || '0.00');
  if (currentFund < delta) {
    throw new Error(
      `الرصيد غير كافٍ في (${FUND_POOL_LABELS_AR[fundType]}) داخل حساب (${account.name}). المتاح حالياً: ${account.fundBalances[fundType]} ج.م.`,
    );
  }
  if (currentTotal < delta) {
    throw new Error(
      `الرصيد الإجمالي غير كافٍ في حساب (${account.name}). المتاح حالياً: ${account.currentBalance} ج.م.`,
    );
  }
  account.currentBalance = formatPiastersToDecimal(currentTotal - delta);
  account.fundBalances[fundType] = formatPiastersToDecimal(currentFund - delta);
  account.updatedAt = new Date().toISOString();
}
