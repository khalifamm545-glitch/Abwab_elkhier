import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Plus,
  StopCircle,
  Users,
} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {api, ApiError, type PensionsOverviewResponse} from '../../lib/api';
import {formatArabicMonthKey, formatEGP, formatInteger} from '../../lib/formatters';
import {
  FUND_POOL_LABELS_AR,
  PENSION_STATUS_LABELS_AR,
  type AuthUser,
  type CharityPensionPlan,
  type FundPoolType,
  type PensionStatus,
  type RolePermissionMatrix,
} from '../../types/auth';
import {ConfirmDialog} from './ConfirmDialog';

interface PensionsPanelProps {
  user: AuthUser;
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

const ALLOWED_PENSION_FUNDS: FundPoolType[] = ['sadaqah', 'zakat_mal', 'general'];

export function PensionsPanel({user, permissions, onFeedback, onDataChanged}: PensionsPanelProps) {
  const isPresident = user.role === 'president';
  const defaultMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [data, setData] = useState<PensionsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Create pension plan form
  const [showAddForm, setShowAddForm] = useState(false);
  const [familyId, setFamilyId] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('1000.00');
  const [startMonthKey, setStartMonthKey] = useState(defaultMonth);
  const [fundType, setFundType] = useState<FundPoolType>('sadaqah');
  const [notes, setNotes] = useState('');

  // Disbursement preferences
  const [selectedTreasuryId, setSelectedTreasuryId] = useState('');
  const [proofRefMap, setProofRefMap] = useState<Record<string, string>>({});

  // Confirm status change
  const [statusAction, setStatusAction] = useState<{
    plan: CharityPensionPlan;
    nextStatus: PensionStatus;
  } | null>(null);

  const loadPensions = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const res = await api.getPensions(month);
      setData(res);
      if (res.treasuryAccounts.length > 0) {
        setSelectedTreasuryId((prev) => prev || res.treasuryAccounts[0].id);
      }
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل بيانات معاشات الخير.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadPensions(selectedMonth);
  }, [selectedMonth, loadPensions]);

  const handleCreatePlan = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createPensionPlan({
        familyId,
        monthlyAmount,
        startMonthKey,
        fundType,
        notes,
      });
      setFamilyId('');
      setNotes('');
      setShowAddForm(false);
      onFeedback({type: 'success', text: 'تم اعتماد وإدراج الأسرة في نظام معاشات الخير بنجاح.'});
      await loadPensions(selectedMonth);
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر إنشاء خطة المعاش.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisburseMonth = async (plan: CharityPensionPlan, targetMonth: string) => {
    setSubmitting(true);
    try {
      await api.recordDisbursement({
        familyId: plan.familyId,
        monthKey: targetMonth,
        amount: plan.monthlyAmount,
        fundType: plan.fundType,
        treasuryAccountId: selectedTreasuryId || null,
        proofReference: proofRefMap[plan.id] || '',
        notes: `صرف معاش خير عن شهر ${targetMonth}`,
      });
      setProofRefMap((prev) => ({...prev, [plan.id]: ''}));
      onFeedback({
        type: 'success',
        text: `تم صرف معاش الخير للأسرة (${plan.familyFileNumber}) عن شهر ${formatArabicMonthKey(targetMonth)} بنجاح.`,
      });
      await loadPensions(selectedMonth);
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تنفيذ صرف المعاش الشهري.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusAction) return;
    setSubmitting(true);
    try {
      await api.updatePensionPlan(statusAction.plan.id, {status: statusAction.nextStatus});
      onFeedback({
        type: 'success',
        text: `تم تحديث حالة معاش الأسرة (${statusAction.plan.familyFileNumber}) إلى «${PENSION_STATUS_LABELS_AR[statusAction.nextStatus]}».`,
      });
      setStatusAction(null);
      await loadPensions(selectedMonth);
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تعديل حالة المعاش.',
      });
      setStatusAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-[#102A24]/70">الأسر المستفيدة بالمعاش الساري</p>
            <Users className="h-4 w-4 text-[#167764]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-[#0F4F42]">
            {formatInteger(summary?.activeCount ?? 0)}{' '}
            <span className="text-sm font-semibold text-[#102A24]/60">أسرة</span>
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65 tabular-nums">
            موقوف مؤقتاً: {formatInteger(summary?.pausedCount ?? 0)} · منتهي:{' '}
            {formatInteger(summary?.stoppedCount ?? 0)}
          </p>
        </article>

        <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-[#102A24]/70">إجمالي المعاشات الشهرية</p>
            <Banknote className="h-4 w-4 text-[#167764]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
            {formatEGP(summary?.monthlyTotal ?? '0.00')}{' '}
            <span className="text-xs font-bold text-[#167764]">ج.م</span>
          </p>
          <p className="mt-1 text-xs text-[#32764C] tabular-nums">
            المصروف لشهر {selectedMonth}: {formatEGP(summary?.paidForMonthTotal ?? '0.00')} ج.م
          </p>
        </article>

        <article className="rounded-2xl border border-[#D9A436]/35 bg-[#FDFBF5] p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-[#0F4F42]">إجمالي الالتزام السنوي (×١٢)</p>
            <CalendarClock className="h-4 w-4 text-[#9A6F18]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42] sm:text-3xl">
            {formatEGP(summary?.annualTotal ?? '0.00')}{' '}
            <span className="text-xs font-bold text-[#9A6F18]">ج.م</span>
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65">تقدير سنوي للخطط السارية حالياً</p>
        </article>

        <article className="rounded-2xl border border-[#167764]/14 bg-white p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-[#102A24]/70">المتأخرات والمستحقات غير المصروفة</p>
            <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold tabular-nums text-amber-700 sm:text-3xl">
            {formatEGP(summary?.totalArrearsAmount ?? '0.00')}{' '}
            <span className="text-xs font-bold">ج.م</span>
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65 tabular-nums">
            عدد الأسر التي لها متأخرات: {formatInteger(summary?.arrearsPlansCount ?? 0)} أسرة
          </p>
        </article>
      </section>

      {/* Controls & Add Plan Form */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              نظام معاشات الخير — كشف شهر {formatArabicMonthKey(selectedMonth)}
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              كل شهر مستقل بسجل صرفه وإثبات الاستلام، مع منع خادمي لتكرار الصرف ومتابعة المتأخرات تلقائياً.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="اختيار شهر كشف المعاشات"
              className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-xs font-bold text-[#0F4F42] tabular-nums"
            />
            {data && data.treasuryAccounts.length > 0 && (
              <select
                value={selectedTreasuryId}
                onChange={(e) => setSelectedTreasuryId(e.target.value)}
                aria-label="الخزينة المستخدمة لصرف المعاشات"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-xs font-semibold text-[#0F4F42]"
              >
                <option value="">صرف بدون خصم تلقائي من الخزينة</option>
                {data.treasuryAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    الخصم من: {acc.name} ({formatEGP(acc.currentBalance)} ج.م)
                  </option>
                ))}
              </select>
            )}
            {isPresident && (
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{showAddForm ? 'إغلاق' : 'اعتماد خطة معاش جديدة'}</span>
              </button>
            )}
          </div>
        </div>

        {showAddForm && isPresident && (
          <form
            onSubmit={handleCreatePlan}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-extrabold text-[#0F4F42]">
              إنشاء خطة معاش خير شهري جديدة
            </h3>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#0F4F42]">الأسرة المستفيدة *</label>
                <select
                  required
                  value={familyId}
                  onChange={(e) => setFamilyId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— اختر الأسرة المستفيدة —</option>
                  {(data?.eligibleFamilies || []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fileNumber} — {f.headOfHousehold} ({f.governorate})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  قيمة المعاش الشهري (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  dir="ltr"
                  value={monthlyAmount}
                  onChange={(e) => setMonthlyAmount(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">شهر بدء الاستحقاق *</label>
                <input
                  type="month"
                  required
                  value={startMonthKey}
                  onChange={(e) => setStartMonthKey(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الصندوق المموّل</label>
                <select
                  value={fundType}
                  onChange={(e) => setFundType(e.target.value as FundPoolType)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {ALLOWED_PENSION_FUNDS.map((ft) => (
                    <option key={ft} value={ft}>
                      {FUND_POOL_LABELS_AR[ft]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-[#0F4F42]">ملاحظات الاعتماد</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="اختياري — قرار اللجنة أو تفاصيل التسليم"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'جارٍ الحفظ...' : 'حفظ خطة المعاش'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Pension Plans List */}
      {loading && !data ? (
        <div className="h-44 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : !data || data.rows.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <p className="font-display text-base font-bold text-[#0F4F42]">
            لا توجد خطط معاشات خير مسجلة حالياً
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65">
            أضف أول أسرة مستفيدة إلى نظام معاشات الخير لمتابعة الصرف الشهري والمتأخرات بدقة.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {data.rows.map(({plan, paidDisbursement, arrearsMonthKeys, arrearsTotal}) => (
            <article
              key={plan.id}
              className="rounded-3xl border border-[#167764]/14 bg-white p-5 space-y-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-[#167764] tabular-nums">
                    {plan.familyFileNumber} · {PENSION_STATUS_LABELS_AR[plan.status]} · بدء من{' '}
                    {formatArabicMonthKey(plan.startMonthKey)}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-extrabold text-[#0F4F42]">
                    {plan.headOfHousehold}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#102A24]/65">
                    الصندوق: {FUND_POOL_LABELS_AR[plan.fundType]} · المعتمد: {plan.approvedByName}
                  </p>
                </div>
                <div className="text-right sm:text-left">
                  <p className="font-display text-2xl font-extrabold tabular-nums text-[#0F4F42]">
                    {formatEGP(plan.monthlyAmount)}{' '}
                    <span className="text-xs font-bold text-[#167764]">ج.م / شهرياً</span>
                  </p>
                  {paidDisbursement ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#32764C]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>
                        تم صرف شهر {selectedMonth}
                        {paidDisbursement.proofReference
                          ? ` (إثبات: ${paidDisbursement.proofReference})`
                          : ''}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      لم يُصرف بعد عن شهر {formatArabicMonthKey(selectedMonth)}
                    </p>
                  )}
                </div>
              </div>

              {/* Arrears Strip */}
              {arrearsMonthKeys.length > 0 && (
                <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-amber-900">
                      متأخرات غير مصروفة ({formatInteger(arrearsMonthKeys.length)} شهر) بإجمالي{' '}
                      <span className="tabular-nums">{formatEGP(arrearsTotal)} ج.م</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {arrearsMonthKeys.slice(0, 6).map((mk) => (
                      <button
                        key={mk}
                        type="button"
                        disabled={submitting || !permissions.canRecordMonthlyAssistance}
                        onClick={() => handleDisburseMonth(plan, mk)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-amber-400/60 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                      >
                        <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>سداد متأخر {mk}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Row */}
              <div className="flex flex-col gap-3 border-t border-[#167764]/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                {!paidDisbursement &&
                plan.status === 'active' &&
                permissions.canRecordMonthlyAssistance ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={proofRefMap[plan.id] || ''}
                      onChange={(e) =>
                        setProofRefMap((prev) => ({...prev, [plan.id]: e.target.value}))
                      }
                      placeholder="مرجع إثبات الصرف (رقم الإيصال / التحويل)"
                      className="min-h-[42px] flex-1 min-w-[200px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDisburseMonth(plan, selectedMonth)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>تسجيل صرف {selectedMonth}</span>
                    </button>
                  </div>
                ) : (
                  <div />
                )}

                {isPresident && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {plan.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => setStatusAction({plan, nextStatus: 'paused'})}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                      >
                        <PauseCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                        <span>إيقاف مؤقت</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatusAction({plan, nextStatus: 'active'})}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                      >
                        <PlayCircle className="h-4 w-4" aria-hidden="true" />
                        <span>إعادة تفعيل</span>
                      </button>
                    )}
                    {plan.status !== 'stopped' && (
                      <button
                        type="button"
                        onClick={() => setStatusAction({plan, nextStatus: 'stopped'})}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 cursor-pointer"
                      >
                        <StopCircle className="h-4 w-4" aria-hidden="true" />
                        <span>إنهاء المعاش</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(statusAction)}
        titleAr="تأكيد تعديل حالة معاش الخير"
        messageAr={
          statusAction
            ? `هل تؤكد تغيير حالة معاش الأسرة (${statusAction.plan.familyFileNumber} — ${statusAction.plan.headOfHousehold}) إلى «${PENSION_STATUS_LABELS_AR[statusAction.nextStatus]}»؟ يُوثّق هذا التعديل في سجل المراجعة.`
            : ''
        }
        confirmLabelAr="اعتماد التعديل"
        tone={statusAction?.nextStatus === 'stopped' ? 'danger' : 'warning'}
        loading={submitting}
        onCancel={() => setStatusAction(null)}
        onConfirm={handleConfirmStatusChange}
      />
    </div>
  );
}
