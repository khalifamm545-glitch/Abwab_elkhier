import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FolderKanban,
  HandHeart,
  HeartHandshake,
  Landmark,
  Lock,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ELIGIBILITY_LABELS_AR,
  FUND_POOL_LABELS_AR,
  ROLE_META,
  WORKFLOW_STATUS_LABELS_AR,
  type AuthUser,
  type DashboardOverviewData,
  type DashboardPeriodFilter,
  type FamilyEligibilityStatus,
  type RolePermissionMatrix,
} from '../../types/auth';
import {
  formatArabicDateTime,
  formatArabicMonthKey,
  formatEGP,
  formatInteger,
} from '../../lib/formatters';
import {FinancialChart, type CreateDonationInput} from './FinancialChart';

interface OverviewStatsViewProps {
  user: AuthUser;
  permissions: RolePermissionMatrix;
  overview: DashboardOverviewData | null;
  period: DashboardPeriodFilter;
  onChangePeriod: (period: DashboardPeriodFilter) => void;
  loading: boolean;
  submitting?: boolean;
  onRecordDonation?: (payload: CreateDonationInput) => Promise<boolean>;
  onNavigate: (tab: string) => void;
}

const PERIOD_OPTIONS: Array<{id: DashboardPeriodFilter; labelAr: string}> = [
  {id: 'month', labelAr: 'الشهر الحالي'},
  {id: 'quarter', labelAr: 'ربع سنوي'},
  {id: 'year', labelAr: 'السنة الحالية'},
  {id: 'all', labelAr: 'الكل'},
];

const ELIGIBILITY_ORDER: Array<{
  key: FamilyEligibilityStatus;
  barColor: string;
  textColor: string;
}> = [
  {key: 'priority', barColor: 'bg-[#0F4F42]', textColor: 'text-[#0F4F42]'},
  {key: 'eligible', barColor: 'bg-[#32764C]', textColor: 'text-[#32764C]'},
  {key: 'pending_review', barColor: 'bg-[#67B477]', textColor: 'text-[#167764]'},
  {key: 'suspended', barColor: 'bg-[#102A24]/30', textColor: 'text-[#102A24]/65'},
];

function computePercentage(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

export function OverviewStatsView({
  user,
  permissions,
  overview,
  period,
  onChangePeriod,
  loading,
  submitting = false,
  onRecordDonation,
  onNavigate,
}: OverviewStatsViewProps) {
  const roleInfo = ROLE_META[user.role];
  const familiesSummary = overview?.familiesSummary ?? null;
  const monthlySummary = overview?.monthlyAssistanceSummary ?? null;
  const financialGovernance = overview?.financialGovernance ?? null;
  const kpis = overview?.executiveKpis ?? null;

  const enrollmentPercent = familiesSummary
    ? computePercentage(familiesSummary.enrolledMonthlyCount, familiesSummary.totalFamilies)
    : 0;

  const scheduledNumeric = monthlySummary ? Number(monthlySummary.scheduledMonthlyTotal) : 0;
  const disbursedNumeric = monthlySummary ? Number(monthlySummary.disbursedCurrentMonthTotal) : 0;
  const disbursementPercent =
    scheduledNumeric > 0 ? Math.min(100, Math.round((disbursedNumeric / scheduledNumeric) * 100)) : 0;

  const hasAnyModuleEnabled = Object.values(permissions.modulePermissions).some(Boolean);
  const hasAnyOperationalAccess =
    user.role === 'president' || (hasAnyModuleEnabled && permissions.canViewData);

  return (
    <div className="space-y-6">
      {/* Executive Identity & Time-Period Filter Header */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#32764C]">
              الحساب الموثّق · {roleInfo.labelAr} · نطاق العرض:{' '}
              {overview?.statsScopeLabelAr || permissions.statsScopeLabelAr}
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-extrabold text-[#0F4F42] sm:text-3xl">
              مرحباً، {user.fullName}
            </h2>
            <p className="mt-1.5 text-sm text-[#102A24]/70">
              اسم المستخدم: <span className="font-semibold" dir="ltr">@{user.username}</span> ·{' '}
              البريد الإلكتروني: <span dir="ltr">{user.email}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end shrink-0">
            {hasAnyOperationalAccess && (
              <div
                role="group"
                aria-label="تصفية مؤشرات لوحة التحكم حسب الفترة الزمنية"
                className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[#EEF7F0] p-1"
              >
                <span className="inline-flex items-center gap-1 px-2 text-[11px] font-bold text-[#0F4F42]">
                  <Calendar className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                  <span>الفترة:</span>
                </span>
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangePeriod(opt.id)}
                    className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      period === opt.id
                        ? 'bg-[#167764] text-white'
                        : 'text-[#0F4F42]/80 hover:text-[#0F4F42]'
                    }`}
                  >
                    {opt.labelAr}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {permissions.canManageUsers && (
                <button
                  type="button"
                  onClick={() => onNavigate('users')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D9A436]/40 bg-[#FDFBF5] px-4 py-2 text-xs font-bold text-[#0F4F42] transition-colors hover:bg-[#FDF6E4] whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#9A6F18]" aria-hidden="true" />
                  <span>إدارة المديرين والصلاحيات</span>
                </button>
              )}
              {permissions.canRecordDonations && (
                <button
                  type="button"
                  onClick={() => onNavigate('donations')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0F4F42] whitespace-nowrap cursor-pointer"
                >
                  <HandHeart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>تسجيل تبرع</span>
                </button>
              )}
              {permissions.canManageFamilies && (
                <button
                  type="button"
                  onClick={() => onNavigate('families')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-2 text-xs font-bold text-[#0F4F42] transition-colors hover:bg-[#EEF7F0] whitespace-nowrap cursor-pointer"
                >
                  <HeartHandshake className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
                  <span>الأسر المستفيدة</span>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-[#167764]/10 pt-4">
          <p className="text-sm font-semibold text-[#0F4F42]">{permissions.summaryAr}</p>
          <ul className="mt-2.5 grid grid-cols-1 gap-2 text-xs text-[#102A24]/80 md:grid-cols-2">
            {permissions.capabilitiesAr.map((cap) => (
              <li key={cap} className="flex items-start gap-2">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#32764C]" aria-hidden="true" />
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Loading Skeleton */}
      {loading && !overview && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="h-32 animate-pulse rounded-2xl border border-[#167764]/10 bg-white"
            />
          ))}
        </div>
      )}

      {/* EXECUTIVE FINANCIAL & IMPACT KPIS */}
      {overview && kpis && (
        <>
          {(kpis.totalDonations !== null ||
            kpis.currentTreasuryBalance !== null ||
            kpis.beneficiaryFamiliesCount !== null) && (
            <section aria-label="المؤشرات التنفيذية والمالية للجمعية" className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-display text-lg font-extrabold text-[#0F4F42]">
                    الملخص التنفيذي والمالي للجمعية
                  </h3>
                  <p className="text-xs text-[#102A24]/65">
                    أرقام فعلية محسوبة لحظياً من قاعدة البيانات دون بيانات تجريبية · العملة: جنيه مصري (ج.م)
                  </p>
                </div>
                {kpis.pendingApprovalsCount !== null && kpis.pendingApprovalsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('finance')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D9A436]/40 bg-[#D9A436]/12 px-3 py-1.5 text-xs font-bold text-[#8A6112] hover:bg-[#D9A436]/20 cursor-pointer self-start"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {formatInteger(kpis.pendingApprovalsCount)} معاملة مالية بانتظار الاعتماد أو التنفيذ
                    </span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.totalDonations !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">إجمالي التبرعات</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#167764]">
                        <TrendingUp className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
                      {formatEGP(kpis.totalDonations)}{' '}
                      <span className="text-xs font-bold text-[#167764]">ج.م</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#32764C] tabular-nums">
                      عدد التبرعات في الفترة: {formatInteger(kpis.donationsCountInPeriod ?? 0)} عملية
                    </p>
                  </article>
                )}

                {kpis.totalExpenses !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">إجمالي المصروفات والمساعدات</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#32764C]">
                        <TrendingDown className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
                      {formatEGP(kpis.totalExpenses)}{' '}
                      <span className="text-xs font-bold text-[#32764C]">ج.م</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#102A24]/70 tabular-nums">
                      المساعدات المنفذة: {formatInteger(kpis.executedAssistancesCount ?? 0)} عملية صرف
                    </p>
                  </article>
                )}

                {kpis.currentTreasuryBalance !== null && (
                  <article className="rounded-2xl border border-[#D9A436]/35 bg-[#FDFBF5] p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#0F4F42]">الرصيد الحالي بالخزينة والبنوك</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D9A436]/15 text-[#9A6F18]">
                        <Landmark className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
                      {formatEGP(kpis.currentTreasuryBalance)}{' '}
                      <span className="text-xs font-bold text-[#9A6F18]">ج.م</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#102A24]/70">
                      موزّع مع فصل تام لصناديق الزكاة والصدقات والعام
                    </p>
                  </article>
                )}

                {kpis.pendingObligationsTotal !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">الالتزامات المالية المستحقة</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#0F4F42]">
                        <Receipt className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
                      {formatEGP(kpis.pendingObligationsTotal)}{' '}
                      <span className="text-xs font-bold text-[#167764]">ج.م</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#102A24]/65">
                      تشمل معاشات الشهر المستحقة والقيود قيد الاعتماد والتنفيذ
                    </p>
                  </article>
                )}

                {kpis.beneficiaryFamiliesCount !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">الأسر المستفيدة المعتمدة</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#167764]">
                        <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                      {formatInteger(kpis.beneficiaryFamiliesCount)}{' '}
                      <span className="text-sm font-semibold text-[#102A24]/60">أسرة</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#102A24]/70 tabular-nums">
                      إجمالي المسجلين: {formatInteger(kpis.registeredFamiliesCount ?? 0)} ملف أسرة
                    </p>
                  </article>
                )}

                {familiesSummary !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">المشمولون بالمعاش والدعم الشهري</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#32764C]">
                        <Banknote className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                      {formatInteger(familiesSummary.enrolledMonthlyCount)}{' '}
                      <span className="text-sm font-semibold text-[#102A24]/60">أسرة</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#32764C] tabular-nums">
                      إجمالي الأفراد: {formatInteger(familiesSummary.totalIndividuals)} فرد · شمول {enrollmentPercent}%
                    </p>
                  </article>
                )}

                {monthlySummary !== null && (
                  <article className="rounded-2xl border border-[#167764]/18 bg-[#EEF7F0]/45 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#0F4F42]">المصروف الفعلي للشهر الحالي</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#167764]/12 bg-white text-[#167764]">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
                      {formatEGP(monthlySummary.disbursedCurrentMonthTotal)}{' '}
                      <span className="text-xs font-bold text-[#167764]">ج.م</span>
                    </p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[#0F4F42]/75 tabular-nums">
                        <span>{formatArabicMonthKey(monthlySummary.currentMonthKey)}</span>
                        <span className="text-[#167764]">{disbursementPercent}% من المجدول</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-[#167764] transition-all duration-300"
                          style={{width: `${disbursementPercent}%`}}
                        />
                      </div>
                    </div>
                  </article>
                )}

                {kpis.volunteersCount !== null && (
                  <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#102A24]/70">عدد المتطوعين المسجلين</p>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF7F0] text-[#167764]">
                        <Users className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                      {formatInteger(kpis.volunteersCount)}{' '}
                      <span className="text-sm font-semibold text-[#102A24]/60">متطوع</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[#102A24]/65 tabular-nums">
                      المهام المتاحة: {formatInteger(overview.stats.visibleTasksCount)} مهمة
                    </p>
                  </article>
                )}
              </div>
            </section>
          )}

          {/* Recharts Monthly Donations & Financial Governance Chart */}
          {financialGovernance !== null && (
            <FinancialChart
              summary={financialGovernance}
              user={user}
              canRecordDonations={permissions.canRecordDonations}
              availableActivities={overview.availableActivities}
              submitting={submitting}
              onRecordDonation={onRecordDonation}
            />
          )}

          {/* Latest Financial Operations & Latest Charity Activities */}
          {(overview.recentFinancialTransactions.length > 0 ||
            overview.recentActivities.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {permissions.canViewTreasury && (
                <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-base font-bold text-[#0F4F42]">
                      أحدث العمليات المالية بالخزينة
                    </h4>
                    <button
                      type="button"
                      onClick={() => onNavigate('finance')}
                      className="text-xs font-bold text-[#167764] hover:text-[#0F4F42] cursor-pointer"
                    >
                      عرض الكل
                    </button>
                  </div>
                  {overview.recentFinancialTransactions.length === 0 ? (
                    <p className="mt-4 text-xs text-[#102A24]/60">
                      لا توجد قيود مالية مسجلة حتى الآن.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y divide-[#167764]/10">
                      {overview.recentFinancialTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#0F4F42] truncate">{tx.title}</p>
                            <p className="mt-0.5 text-[11px] text-[#102A24]/65">
                              {tx.entryNumber} · {FUND_POOL_LABELS_AR[tx.fundType]} ·{' '}
                              <span className="font-semibold text-[#167764]">
                                {WORKFLOW_STATUS_LABELS_AR[tx.workflowStatus]}
                              </span>
                            </p>
                          </div>
                          <span className="shrink-0 font-display text-sm font-extrabold tabular-nums text-[#0F4F42]">
                            {formatEGP(tx.amount)} ج.م
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {permissions.canViewAllActivities && (
                <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-base font-bold text-[#0F4F42]">
                      أحدث الأنشطة الخيرية
                    </h4>
                    <button
                      type="button"
                      onClick={() => onNavigate('activities')}
                      className="text-xs font-bold text-[#167764] hover:text-[#0F4F42] cursor-pointer"
                    >
                      عرض الأنشطة
                    </button>
                  </div>
                  {overview.recentActivities.length === 0 ? (
                    <p className="mt-4 text-xs text-[#102A24]/60">
                      لا توجد أنشطة خيرية مسجلة حتى الآن.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y divide-[#167764]/10">
                      {overview.recentActivities.map((act) => (
                        <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-[#0F4F42]">{act.name}</p>
                            <span className="text-[11px] font-semibold text-[#32764C]">
                              {act.status === 'active'
                                ? 'نشط'
                                : act.status === 'planned'
                                  ? 'مخطط'
                                  : 'مكتمل'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#102A24]/70 line-clamp-2">
                            {act.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Analytical Breakdown Panels */}
          {(familiesSummary !== null || monthlySummary !== null) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {familiesSummary !== null && (
                <section className="rounded-3xl border border-[#167764]/12 bg-white p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-display text-base font-bold text-[#0F4F42]">
                        توزيع الأسر حسب حالة الأهلية
                      </h4>
                      <p className="mt-0.5 text-xs text-[#102A24]/65">
                        تصنيف الملفات المسجلة فعلياً ضمن نطاق صلاحيتك
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-[#167764]">
                      {formatInteger(familiesSummary.totalFamilies)} أسرة
                    </span>
                  </div>

                  {familiesSummary.totalFamilies === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-[#167764]/20 bg-[#F7FAF8] p-5 text-center">
                      <p className="text-sm font-semibold text-[#0F4F42]">
                        لا توجد أسر مسجلة في هذا النطاق حتى الآن
                      </p>
                      <p className="mt-1 text-xs text-[#102A24]/65">
                        تبدأ الإحصائيات من الصفر وتُحدَّث فور تسجيل الأسر الحقيقية.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {ELIGIBILITY_ORDER.map(({key, barColor, textColor}) => {
                        const count = familiesSummary.byEligibility[key];
                        const pct = computePercentage(count, familiesSummary.totalFamilies);
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className={`font-semibold ${textColor}`}>
                                {ELIGIBILITY_LABELS_AR[key]}
                              </span>
                              <span className="text-xs font-semibold text-[#102A24]/75 tabular-nums">
                                {formatInteger(count)} أسرة · {pct}%
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF7F0]">
                              <div
                                className={`h-full rounded-full ${barColor} transition-all duration-300`}
                                style={{width: `${pct}%`}}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {monthlySummary !== null && (
                <section className="rounded-3xl border border-[#167764]/12 bg-white p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-display text-base font-bold text-[#0F4F42]">
                        توزيع المساعدات الشهرية حسب نوع الدعم
                      </h4>
                      <p className="mt-0.5 text-xs text-[#102A24]/65">
                        إجمالي الالتزامات الشهرية الموزعة على برامج المساعدات (ج.م)
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-[#167764]">
                      {formatEGP(monthlySummary.scheduledMonthlyTotal)} ج.م
                    </span>
                  </div>

                  {scheduledNumeric <= 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-[#167764]/20 bg-[#F7FAF8] p-5 text-center">
                      <p className="text-sm font-semibold text-[#0F4F42]">
                        لا توجد مساعدات شهرية مجدولة حالياً
                      </p>
                      <p className="mt-1 text-xs text-[#102A24]/65">
                        عند اعتماد معاشات الخير أو الدعم الشهري للأسر يظهر التوزيع هنا بالجنيه المصري.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {monthlySummary.bySupportType.map((row) => {
                        const rowVal = Number(row.monthlyTotal);
                        const pct =
                          scheduledNumeric > 0
                            ? Math.min(100, Math.round((rowVal / scheduledNumeric) * 100))
                            : 0;
                        return (
                          <div key={row.supportType} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-semibold text-[#0F4F42] truncate">
                                {row.labelAr}
                              </span>
                              <span className="text-xs font-semibold text-[#102A24]/80 tabular-nums whitespace-nowrap shrink-0">
                                {formatInteger(row.familiesCount)} أسرة ·{' '}
                                <span className="font-bold text-[#167764]">
                                  {formatEGP(row.monthlyTotal)} ج.م
                                </span>
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF7F0]">
                              <div
                                className="h-full rounded-full bg-[#167764] transition-all duration-300"
                                style={{width: `${pct}%`}}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Zero-Permissions Manager Pending Notice */}
          {user.role === 'manager' && !hasAnyOperationalAccess && (
            <section className="rounded-2xl border border-[#167764]/18 bg-[#EEF7F0]/75 p-5 flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
              <div className="text-sm text-[#0F4F42]">
                <p className="font-bold">
                  حسابك الإداري مفعّل — بانتظار تحديد الأقسام والصلاحيات من رئيس مجلس الإدارة
                </p>
                <p className="mt-1 text-xs leading-6 text-[#102A24]/80">
                  تطبيقاً لضوابط الأمان في جمعية أبواب الخير، لا يمتلك المدير أي صلاحيات تلقائية قبل
                  تفعيلها من رئيس مجلس الإدارة. فور تحديد الأقسام والصلاحيات المخصصة لحسابك ستظهر
                  لوحات العمل والإحصائيات هنا تلقائياً.
                </p>
              </div>
            </section>
          )}

          {/* Operational & Platform Counters (Strictly Permission-Scoped) */}
          {(overview.stats.totalUsers !== null ||
            overview.stats.pendingPasswordResets !== null ||
            permissions.canViewAllActivities) && (
            <section aria-label="إحصائيات التشغيل والمنصة" className="space-y-3">
              <h3 className="font-display text-base font-bold text-[#0F4F42]">
                مؤشرات التشغيل والمنصة
              </h3>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {overview.stats.totalUsers !== null && (
                  <div className="rounded-2xl border border-[#167764]/12 bg-white p-5">
                    <p className="text-xs font-medium text-[#102A24]/65">
                      إجمالي الحسابات الإدارية
                    </p>
                    <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                      {formatInteger(overview.stats.totalUsers)}
                    </p>
                    <p className="mt-1 text-xs text-[#32764C] tabular-nums">
                      نشط: {formatInteger(overview.stats.activeUsers ?? 0)}
                    </p>
                  </div>
                )}

                {overview.stats.pendingPasswordResets !== null && (
                  <div className="rounded-2xl border border-[#167764]/12 bg-white p-5">
                    <p className="text-xs font-medium text-[#102A24]/65">
                      طلبات استعادة كلمة المرور
                    </p>
                    <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                      {formatInteger(overview.stats.pendingPasswordResets)}
                    </p>
                    <p className="mt-1 text-xs text-[#102A24]/60">طلبات نشطة حالياً</p>
                  </div>
                )}

                {permissions.canViewAllActivities && (
                  <>
                    <div className="rounded-2xl border border-[#167764]/12 bg-white p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[#102A24]/65">
                          الأنشطة المصرح بمتابعتها
                        </p>
                        <FolderKanban
                          className="h-4 w-4 shrink-0 text-[#32764C]"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                        {formatInteger(overview.stats.visibleActivitiesCount)}
                      </p>
                      <p className="mt-1 text-xs text-[#102A24]/60 truncate">بيانات فعلية مسجلة</p>
                    </div>

                    <div className="rounded-2xl border border-[#167764]/12 bg-white p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[#102A24]/65">المهام الميدانية</p>
                        <ClipboardList
                          className="h-4 w-4 shrink-0 text-[#32764C]"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
                        {formatInteger(overview.stats.visibleTasksCount)}
                      </p>
                      <p className="mt-1 text-xs text-[#102A24]/60 tabular-nums">
                        بيانات فعلية مسجلة
                      </p>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Recent Audit Feed */}
          {overview.recentLogs.length > 0 && (
            <section className="rounded-3xl border border-[#167764]/12 bg-white p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-[#0F4F42]">
                  أحدث إجراءات المتابعة وسجل المراجعة
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('security')}
                  className="text-xs font-bold text-[#167764] hover:text-[#0F4F42] cursor-pointer"
                >
                  السجل الكامل
                </button>
              </div>
              <div className="mt-4 divide-y divide-[#167764]/10">
                {overview.recentLogs.slice(0, 6).map((log) => (
                  <div key={log.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-[#102A24]">{log.summaryAr}</p>
                    <p className="mt-1 text-xs text-[#102A24]/60">
                      {log.actorName} · {formatArabicDateTime(log.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
