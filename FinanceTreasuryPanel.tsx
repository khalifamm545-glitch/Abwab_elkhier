import {
  ArrowLeftRight,
  Ban,
  Building2,
  CheckCircle2,
  Landmark,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {api, ApiError, type FinanceOverviewResponse} from '../../lib/api';
import {formatArabicDateTime, formatEGP} from '../../lib/formatters';
import {
  FINANCIAL_PURPOSE_LABELS_AR,
  FUND_POOL_LABELS_AR,
  WORKFLOW_STATUS_LABELS_AR,
  type AuthUser,
  type FinancialPurposeCategory,
  type FinancialTransaction,
  type FinancialTxType,
  type FundPoolType,
  type RolePermissionMatrix,
  type TreasuryAccountType,
} from '../../types/auth';
import {ConfirmDialog} from './ConfirmDialog';

interface FinanceTreasuryPanelProps {
  user: AuthUser;
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

const FUND_ORDER: FundPoolType[] = [
  'zakat_mal',
  'zakat_fitr',
  'sadaqah',
  'general',
  'project_restricted',
];

const PURPOSE_OPTIONS: FinancialPurposeCategory[] = [
  'zakat_beneficiaries',
  'zakat_fitr_beneficiaries',
  'charity_aid',
  'project_expense',
  'medical_aid',
  'marriage_aid',
  'debt_relief',
  'food_aid',
  'administrative',
];

export function FinanceTreasuryPanel({
  user,
  permissions,
  onFeedback,
  onDataChanged,
}: FinanceTreasuryPanelProps) {
  const [data, setData] = useState<FinanceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filter for journal / statement
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Add Treasury Account Form
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<TreasuryAccountType>('bank_account');
  const [bankName, setBankName] = useState('');
  const [accNumMasked, setAccNumMasked] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0.00');

  // Step 1 Record Transaction Form
  const [showAddTx, setShowAddTx] = useState(false);
  const [txType, setTxType] = useState<Exclude<FinancialTxType, 'reversal'>>('aid_disbursement');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [fundType, setFundType] = useState<FundPoolType>('sadaqah');
  const [purposeCategory, setPurposeCategory] =
    useState<FinancialPurposeCategory>('charity_aid');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [familyId, setFamilyId] = useState('');

  // Confirm Dialogs for Approve / Reject / Execute / Reverse
  const [dialogAction, setDialogAction] = useState<{
    mode: 'approve' | 'reject' | 'execute' | 'reverse';
    tx: FinancialTransaction;
  } | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getFinanceOverview();
      setData(res);
      if (res.accounts.length > 0) {
        setSourceAccountId((prev) => prev || res.accounts[0].id);
      }
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الخزينة والإدارة المالية.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const filteredTx = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter((t) => {
      if (
        accountFilter !== 'all' &&
        t.sourceAccountId !== accountFilter &&
        t.destinationAccountId !== accountFilter
      ) {
        return false;
      }
      if (statusFilter !== 'all' && t.workflowStatus !== statusFilter) return false;
      return true;
    });
  }, [data, accountFilter, statusFilter]);

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createTreasuryAccount({
        name: accName,
        accountType: accType,
        bankName,
        accountNumberMasked: accNumMasked,
        openingBalance,
      });
      setAccName('');
      setBankName('');
      setAccNumMasked('');
      setOpeningBalance('0.00');
      setShowAddAccount(false);
      onFeedback({type: 'success', text: 'تم إنشاء حساب الخزينة / البنك الجديد بنجاح.'});
      await loadFinance();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر إنشاء الحساب المالي.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTx = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createFinancialTransaction({
        txType,
        title,
        description,
        amount,
        txDate,
        fundType,
        purposeCategory: txType === 'transfer' ? 'account_transfer' : purposeCategory,
        sourceAccountId,
        destinationAccountId: txType === 'transfer' ? destinationAccountId || null : null,
        projectId: projectId || null,
        familyId: familyId || null,
      });
      setTitle('');
      setDescription('');
      setAmount('');
      setShowAddTx(false);
      onFeedback({
        type: 'success',
        text: `الخطوة ١ مكتملة: تم تسجيل القيد المالي (${res.transaction.entryNumber}) وهو الآن بانتظار الاعتماد من مستخدم آخر.`,
      });
      await loadFinance();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تسجيل القيد المالي.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmWorkflow = async (inputValue?: string) => {
    if (!dialogAction) return;
    setSubmitting(true);
    try {
      if (dialogAction.mode === 'approve') {
        await api.approveFinancialTransaction(dialogAction.tx.id, inputValue || '');
        onFeedback({
          type: 'success',
          text: `الخطوة ٢ مكتملة: تم اعتماد القيد (${dialogAction.tx.entryNumber}) وهو جاهز لتنفيذ الصرف من مستخدم ثالث.`,
        });
      } else if (dialogAction.mode === 'reject') {
        await api.rejectFinancialTransaction(dialogAction.tx.id, inputValue || '');
        onFeedback({
          type: 'success',
          text: `تم رفض القيد المالي (${dialogAction.tx.entryNumber}) وتوثيق السبب.`,
        });
      } else if (dialogAction.mode === 'execute') {
        await api.executeFinancialTransaction(dialogAction.tx.id, inputValue || '');
        onFeedback({
          type: 'success',
          text: `الخطوة ٣ مكتملة: تم تنفيذ الصرف المالي للقيد (${dialogAction.tx.entryNumber}) وتحديث أرصدة الخزينة.`,
        });
      } else if (dialogAction.mode === 'reverse') {
        const res = await api.reverseFinancialTransaction(dialogAction.tx.id, inputValue || '');
        onFeedback({
          type: 'success',
          text: `تم إنشاء قيد تصحيحي موثق (${res.reversalEntry.entryNumber}) وردّ المبلغ للخزينة مع حفظ السجل الأصلي.`,
        });
      }
      setDialogAction(null);
      await loadFinance();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر إتمام الإجراء المالي.',
      });
      setDialogAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  const canRecord = permissions.canAddData && permissions.canViewTreasury;
  const isPresident = user.role === 'president';

  return (
    <div className="space-y-6">
      {/* Sharia & 3-Step Governance Banner */}
      <section className="rounded-3xl border border-[#D9A436]/35 bg-[#FDFBF5] p-5 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6F18]" aria-hidden="true" />
        <div className="text-xs leading-6 text-[#0F4F42]">
          <p className="font-display text-sm font-extrabold">
            ضوابط الحوكمة المالية والفصل الشرعي للأموال (نظام المراحل الثلاث)
          </p>
          <p className="mt-1 text-[#102A24]/80">
            يطبّق النظام فصلاً خادمياً إلزامياً للصناديق (زكاة المال · زكاة الفطر · الصدقات · التبرعات
            العامة · المشروعات المخصصة) مع منع الصرف الإداري من الزكاة أو الصدقات، ويفرض فصل
            الاختصاصات الثلاثي:{' '}
            <strong>
              ١. تسجيل الطلب ← ٢. موافقة واعتماد رئيس مجلس الإدارة الحصري ← ٣. تنفيذ الصرف عبر مدير مفوّض
            </strong>
            ، ولا يمكن تجاوز موافقة رئيس مجلس الإدارة أو حذف العمليات المعتمدة.
          </p>
        </div>
      </section>

      {/* Fund Pool Balances Strip */}
      {data && (
        <section aria-label="أرصدة الصناديق المالية المفصولة" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold text-[#0F4F42]">
              الأرصدة الإجمالية حسب الفصل الشرعي والمحاسبي
            </h2>
            <p className="font-display text-lg font-extrabold tabular-nums text-[#167764]">
              الإجمالي العام: {formatEGP(data.grandTotalBalance)} ج.م
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FUND_ORDER.map((ft) => (
              <div key={ft} className="rounded-2xl border border-[#167764]/14 bg-white p-4">
                <p className="text-xs font-bold text-[#32764C]">{FUND_POOL_LABELS_AR[ft]}</p>
                <p className="mt-2 font-display text-xl font-extrabold tabular-nums text-[#0F4F42]">
                  {formatEGP(data.fundTotals[ft])}{' '}
                  <span className="text-[11px] font-bold text-[#167764]">ج.م</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Treasury & Bank Accounts */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-extrabold text-[#0F4F42]">
              الخزينة الرئيسية والحسابات البنكية
            </h3>
            <p className="mt-0.5 text-xs text-[#102A24]/65">
              متابعة فورية لرصيد كل خزينة وحساب بنكي وتوزيع الصناديق بداخله.
            </p>
          </div>
          {(canRecord || isPresident) && (
            <div className="flex flex-wrap gap-2">
              {isPresident && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddAccount((v) => !v);
                    setShowAddTx(false);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#167764]/22 bg-[#F7FAF8] px-3.5 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                >
                  <Building2 className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                  <span>{showAddAccount ? 'إغلاق' : 'إضافة خزينة / حساب بنكي'}</span>
                </button>
              )}
              {canRecord && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTx((v) => !v);
                    setShowAddAccount(false);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{showAddTx ? 'إغلاق' : 'تسجيل طلب صرف / تحويل (خطوة ١)'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Add Account Form (President Only) */}
        {showAddAccount && isPresident && (
          <form
            onSubmit={handleCreateAccount}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 space-y-3"
          >
            <h4 className="font-display text-sm font-extrabold text-[#0F4F42]">
              إضافة خزينة نقدية أو حساب بنكي جديد
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                type="text"
                required
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="اسم الخزينة أو الحساب البنكي *"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3 text-sm lg:col-span-2"
              />
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as TreasuryAccountType)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
              >
                <option value="bank_account">حساب بنكي</option>
                <option value="cash_vault">خزينة نقدية</option>
              </select>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="اسم البنك (اختياري)"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="رصيد افتتاحي (ج.م)"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3 text-left text-sm tabular-nums"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={accNumMasked}
                onChange={(e) => setAccNumMasked(e.target.value)}
                placeholder="رقم الحساب المختصر (مثال: ****4821)"
                className="min-h-[42px] flex-1 min-w-[200px] rounded-xl border border-[#167764]/20 bg-white px-3 text-xs"
              />
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                حفظ الحساب
              </button>
            </div>
          </form>
        )}

        {/* Step 1 Record Transaction Form */}
        {showAddTx && canRecord && data && (
          <form
            onSubmit={handleCreateTx}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
          >
            <h4 className="font-display text-sm font-extrabold text-[#0F4F42]">
              الخطوة ١ (التسجيل): إنشاء قيد صرف مالي أو مساعدة أو تحويل بين الحسابات
            </h4>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">نوع العملية *</label>
                <select
                  value={txType}
                  onChange={(e) =>
                    setTxType(e.target.value as Exclude<FinancialTxType, 'reversal'>)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  <option value="aid_disbursement">صرف مساعدة خيرية</option>
                  <option value="expense">مصروف / تنفيذ مشروع</option>
                  <option value="transfer">تحويل بين الخزينة والبنوك</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-left text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">تاريخ العملية *</label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm tabular-nums"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-[#0F4F42]">بيان وعنوان القيد *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: صرف مساعدة علاجية لأسرة أو تحويل من الخزينة للبنك"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  الصندوق المالي (الفصل الشرعي) *
                </label>
                <select
                  value={fundType}
                  onChange={(e) => setFundType(e.target.value as FundPoolType)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  {FUND_ORDER.map((ft) => (
                    <option key={ft} value={ft}>
                      {FUND_POOL_LABELS_AR[ft]} ({formatEGP(data.fundTotals[ft])} ج.م)
                    </option>
                  ))}
                </select>
              </div>
              {txType !== 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">بند الصرف *</label>
                  <select
                    value={purposeCategory}
                    onChange={(e) =>
                      setPurposeCategory(e.target.value as FinancialPurposeCategory)
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                  >
                    {PURPOSE_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {FINANCIAL_PURPOSE_LABELS_AR[p]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الحساب / الخزينة المصدر *</label>
                <select
                  required
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  {data.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatEGP(acc.currentBalance)} ج.م)
                    </option>
                  ))}
                </select>
              </div>
              {txType === 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">الحساب المحوّل إليه *</label>
                  <select
                    required
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                  >
                    <option value="">— اختر الحساب الوجهة —</option>
                    {data.accounts
                      .filter((a) => a.id !== sourceAccountId)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {txType !== 'transfer' && data.projects.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">
                    المشروع الخيري المرتبط
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                  >
                    <option value="">— بدون مشروع —</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {txType !== 'transfer' && data.families.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">
                    الأسرة المستفيدة (اختياري)
                  </label>
                  <select
                    value={familyId}
                    onChange={(e) => setFamilyId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                  >
                    <option value="">— غير مرتبط بأسرة محددة —</option>
                    {data.families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fileNumber} — {f.headOfHousehold}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-[#0F4F42]">تفاصيل ومستندات القيد</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تفاصيل الفاتورة أو المستفيد أو مبرر الصرف..."
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddTx(false)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'جارٍ التسجيل...' : 'تسجيل القيد (المرحلة ١)'}
              </button>
            </div>
          </form>
        )}

        {/* Accounts Cards */}
        {loading && !data ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[#F7FAF8]" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(data?.accounts || []).map((acc) => (
              <article
                key={acc.id}
                className="rounded-2xl border border-[#167764]/14 bg-[#F7FAF8] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#167764] border border-[#167764]/12">
                      {acc.accountType === 'cash_vault' ? (
                        <Wallet className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Landmark className="h-5 w-5" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-extrabold text-[#0F4F42]">
                        {acc.name}
                      </h4>
                      <p className="text-[11px] text-[#102A24]/65">
                        {acc.accountType === 'cash_vault'
                          ? 'خزينة نقدية'
                          : `حساب بنكي${acc.bankName ? ` — ${acc.bankName}` : ''}`}
                        {acc.accountNumberMasked ? ` · ${acc.accountNumberMasked}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="font-display text-xl font-extrabold tabular-nums text-[#0F4F42]">
                    {formatEGP(acc.currentBalance)} <span className="text-xs text-[#167764]">ج.م</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5 border-t border-[#167764]/10 pt-2.5 text-[11px] sm:grid-cols-3">
                  {FUND_ORDER.map((ft) => (
                    <div key={ft} className="flex items-center justify-between gap-1 rounded-lg bg-white px-2 py-1">
                      <span className="text-[#102A24]/65 truncate">
                        {FUND_POOL_LABELS_AR[ft].replace('صندوق ', '')}
                      </span>
                      <span className="font-bold tabular-nums text-[#0F4F42]">
                        {formatEGP(acc.fundBalances[ft])}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Financial Journal & 3-Step Approval / Execution Pipeline */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-extrabold text-[#0F4F42]">
              دفتر القيود المالية وكشف الحسابات
            </h3>
            <p className="mt-0.5 text-xs text-[#102A24]/65">
              كل عملية تمر بمراحل التسجيل والاعتماد والتنفيذ الثلاث بأسماء وأوقات موثقة.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              aria-label="كشف حساب لخزينة محددة"
              className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs font-semibold"
            >
              <option value="all">كافة الخزائن والحسابات</option>
              {(data?.accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  كشف حساب: {a.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="تصفية حسب المرحلة"
              className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs font-semibold"
            >
              <option value="all">كل المراحل</option>
              <option value="recorded">بانتظار الاعتماد (مرحلة ٢)</option>
              <option value="approved">معتمدة — بانتظار التنفيذ (مرحلة ٣)</option>
              <option value="executed">منفّذة</option>
              <option value="rejected">مرفوضة</option>
              <option value="reversed">معكوسة بقيد تصحيحي</option>
            </select>
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#167764]/20 bg-[#F7FAF8] p-8 text-center">
            <p className="text-sm font-bold text-[#0F4F42]">لا توجد قيود مالية مطابقة حالياً</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTx.map((tx) => {
              const canApprove = tx.workflowStatus === 'recorded' && isPresident;
              const waitingPresidentOnly = tx.workflowStatus === 'recorded' && !isPresident;

              const canExecute =
                tx.workflowStatus === 'approved' &&
                permissions.canExecuteFinancial &&
                tx.recordedBy !== user.id &&
                tx.approvedBy !== user.id;
              const blockedExecutor =
                tx.workflowStatus === 'approved' &&
                permissions.canExecuteFinancial &&
                (tx.recordedBy === user.id || tx.approvedBy === user.id);

              const canReverse =
                tx.workflowStatus === 'executed' &&
                tx.txType !== 'reversal' &&
                isPresident;

              return (
                <article
                  key={tx.id}
                  className="rounded-2xl border border-[#167764]/14 bg-[#F7FAF8]/60 p-4 space-y-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#167764] tabular-nums">
                        {tx.entryNumber} · {tx.txDate} · {WORKFLOW_STATUS_LABELS_AR[tx.workflowStatus]}
                      </p>
                      <h4 className="mt-0.5 font-display text-base font-extrabold text-[#0F4F42]">
                        {tx.title}
                      </h4>
                      <p className="mt-0.5 text-xs text-[#102A24]/70">
                        {FUND_POOL_LABELS_AR[tx.fundType]} ·{' '}
                        {FINANCIAL_PURPOSE_LABELS_AR[tx.purposeCategory]} · من {tx.sourceAccountName}
                        {tx.destinationAccountName ? ` ← إلى ${tx.destinationAccountName}` : ''}
                        {tx.projectName ? ` · مشروع: ${tx.projectName}` : ''}
                        {tx.familyName ? ` · مستفيد: ${tx.familyName}` : ''}
                      </p>
                      {tx.description && (
                        <p className="mt-1 text-xs text-[#102A24]/75">{tx.description}</p>
                      )}
                    </div>
                    <p className="font-display text-xl font-extrabold tabular-nums text-[#0F4F42] shrink-0">
                      {formatEGP(tx.amount)} <span className="text-xs text-[#167764]">ج.م</span>
                    </p>
                  </div>

                  {/* 3-Step Audit Trail Bar */}
                  <div className="grid grid-cols-1 gap-2 rounded-xl bg-white p-3 text-[11px] sm:grid-cols-3 border border-[#167764]/10">
                    <div>
                      <p className="font-bold text-[#167764]">١. التسجيل (Maker)</p>
                      <p className="mt-0.5 font-semibold text-[#0F4F42]">{tx.recordedByName}</p>
                      <p className="text-[#102A24]/55">{formatArabicDateTime(tx.recordedAt)}</p>
                    </div>
                    <div>
                      <p className="font-bold text-[#32764C]">٢. الاعتماد (رئيس مجلس الإدارة)</p>
                      <p className="mt-0.5 font-semibold text-[#0F4F42]">
                        {tx.approvedByName || 'بانتظار اعتماد رئيس مجلس الإدارة'}
                      </p>
                      {tx.approvedAt && (
                        <p className="text-[#102A24]/55">{formatArabicDateTime(tx.approvedAt)}</p>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-[#9A6F18]">٣. تنفيذ الصرف (مدير مفوّض)</p>
                      <p className="mt-0.5 font-semibold text-[#0F4F42]">
                        {tx.executedByName || 'بانتظار تنفيذ الصرف بعد الاعتماد'}
                      </p>
                      {tx.executedAt && (
                        <p className="text-[#102A24]/55">{formatArabicDateTime(tx.executedAt)}</p>
                      )}
                    </div>
                  </div>

                  {tx.reversalReason && (
                    <p className="text-xs font-semibold text-red-700">
                      سبب القيد التصحيحي العكسي ({tx.reversedByName}): {tx.reversalReason}
                    </p>
                  )}

                  {/* Workflow Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canApprove && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDialogAction({mode: 'approve', tx})}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#167764] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          <span>اعتماد رئيس مجلس الإدارة (مرحلة ٢)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialogAction({mode: 'reject', tx})}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <Ban className="h-4 w-4" aria-hidden="true" />
                          <span>رفض الطلب</span>
                        </button>
                      </>
                    )}

                    {waitingPresidentOnly && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          بانتظار موافقة واعتماد رئيس مجلس الإدارة — لا يمكن تجاوز الاعتماد.
                        </span>
                      </span>
                    )}

                    {canExecute && (
                      <button
                        type="button"
                        onClick={() => setDialogAction({mode: 'execute', tx})}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0F4F42] px-4 py-2 text-xs font-bold text-white hover:bg-[#167764] cursor-pointer"
                      >
                        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                        <span>تنفيذ الصرف الفعلي (مرحلة ٣)</span>
                      </button>
                    )}

                    {blockedExecutor && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          يتطلب تنفيذ الصرف مستخدماً ثالثاً مختلفاً عن مُسجِّل القيد وعن مُعتمِده.
                        </span>
                      </span>
                    )}

                    {canReverse && (
                      <button
                        type="button"
                        onClick={() => setDialogAction({mode: 'reverse', tx})}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 cursor-pointer"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        <span>قيد تصحيحي عكسي موثق</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(dialogAction)}
        titleAr={
          dialogAction?.mode === 'approve'
            ? 'اعتماد القيد المالي (المرحلة ٢)'
            : dialogAction?.mode === 'reject'
              ? 'رفض القيد المالي'
              : dialogAction?.mode === 'execute'
                ? 'تنفيذ الصرف المالي من الخزينة (المرحلة ٣)'
                : 'إنشاء قيد تصحيحي عكسي موثق'
        }
        messageAr={
          dialogAction?.mode === 'approve'
            ? `هل تؤكد مراجعة واعتماد القيد (${dialogAction.tx.entryNumber}) بقيمة ${formatEGP(dialogAction.tx.amount)} ج.م من ${FUND_POOL_LABELS_AR[dialogAction.tx.fundType]}؟`
            : dialogAction?.mode === 'reject'
              ? `يرجى توضيح سبب رفض القيد (${dialogAction.tx.entryNumber}).`
              : dialogAction?.mode === 'execute'
                ? `سيتم خصم مبلغ ${formatEGP(dialogAction.tx.amount)} ج.م فعلياً من (${dialogAction.tx.sourceAccountName}) وتوثيق الصرف بصورة نهائية غير قابلة للحذف.`
                : `سيتم إنشاء قيد تصحيحي عكسي يردّ مبلغ ${formatEGP(dialogAction?.tx.amount || '0')} ج.م إلى الخزينة مع الاحتفاظ بالقيد الأصلي في سجل المراجعة.`
        }
        confirmLabelAr={
          dialogAction?.mode === 'approve'
            ? 'اعتماد القيد'
            : dialogAction?.mode === 'reject'
              ? 'تأكيد الرفض'
              : dialogAction?.mode === 'execute'
                ? 'تأكيد تنفيذ الصرف'
                : 'إنشاء القيد التصحيحي'
        }
        tone={
          dialogAction?.mode === 'reject' || dialogAction?.mode === 'reverse'
            ? 'danger'
            : 'primary'
        }
        requireTextInput={
          dialogAction?.mode === 'reject'
            ? {labelAr: 'سبب الرفض *', placeholderAr: 'اكتب مبرر الرفض...', minLength: 3}
            : dialogAction?.mode === 'reverse'
              ? {
                  labelAr: 'السبب المحاسبي للقيد التصحيحي *',
                  placeholderAr: 'مثال: تصحيح مبلغ صرف أو إلغاء تحويل بنكي مرتجع...',
                  minLength: 5,
                }
              : dialogAction?.mode === 'execute'
                ? {
                    labelAr: 'رقم مرجع الصرف أو الإيصال (اختياري)',
                    placeholderAr: 'مثال: سند صرف رقم 104',
                    minLength: 0,
                  }
                : {
                    labelAr: 'ملاحظات الاعتماد (اختياري)',
                    placeholderAr: 'ملاحظات للمنفذ المالي...',
                    minLength: 0,
                  }
        }
        loading={submitting}
        onCancel={() => setDialogAction(null)}
        onConfirm={handleConfirmWorkflow}
      />
    </div>
  );
}
