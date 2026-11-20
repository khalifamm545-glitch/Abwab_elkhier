import {BarChart3, Plus, TrendingUp} from 'lucide-react';
import {useMemo, useState, type FormEvent} from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {formatEGP, formatInteger} from '../../lib/formatters';
import {
  DONATION_CATEGORY_LABELS_AR,
  PAYMENT_METHOD_LABELS_AR,
  type AuthUser,
  type DonationCategory,
  type DonationPaymentMethod,
  type FinancialGovernanceSummary,
} from '../../types/auth';

export interface CreateDonationInput {
  donorName?: string;
  isAnonymous?: boolean;
  category: DonationCategory;
  paymentMethod: DonationPaymentMethod;
  amount: string;
  donationDate: string;
  activityId?: string | null;
  notes?: string;
}

interface FinancialChartProps {
  summary: FinancialGovernanceSummary;
  user?: AuthUser;
  canRecordDonations?: boolean;
  availableActivities?: Array<{id: string; name: string}>;
  submitting?: boolean;
  onRecordDonation?: (payload: CreateDonationInput) => Promise<boolean>;
}

interface ChartDatum {
  monthKey: string;
  shortLabelAr: string;
  fullLabelAr: string;
  donations: number;
  donationsExact: string;
  donationsCount: number;
  disbursements: number;
  disbursementsExact: string;
  disbursementsCount: number;
  netBalanceExact: string;
}

const CATEGORY_OPTIONS: DonationCategory[] = [
  'general_donation',
  'monthly_subscription',
  'zakat',
  'zakat_fitr',
  'sadaqah',
  'campaign',
];

const PAYMENT_OPTIONS: DonationPaymentMethod[] = [
  'cash',
  'bank_transfer',
  'instapay',
  'wallet',
];

function formatCompactYAxis(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}م`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}ألف`;
  }
  return String(Math.round(value));
}

function sumExactMoneyStrings(values: string[]): number {
  const totalPiasters = values.reduce((acc, v) => {
    const num = Number(v);
    return acc + (Number.isFinite(num) ? Math.round(num * 100) : 0);
  }, 0);
  return totalPiasters / 100;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{payload: ChartDatum}>;
  showDisbursements: boolean;
}

function GovernanceChartTooltip({active, payload, showDisbursements}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const netVal = Number(point.netBalanceExact);

  return (
    <div
      dir="rtl"
      className="min-w-[215px] rounded-2xl border border-[#167764]/20 bg-white p-3.5 text-right shadow-lg"
    >
      <p className="font-display text-sm font-extrabold text-[#0F4F42]">{point.fullLabelAr}</p>

      <div className="mt-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#102A24]/75">
            <span className="h-2.5 w-2.5 shrink-0 rounded-xs bg-[#167764]" aria-hidden="true" />
            <span>التبرعات الشهرية</span>
          </span>
          <span className="font-bold tabular-nums text-[#0F4F42]">
            {formatEGP(point.donationsExact)} ج.م
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-[#102A24]/60">
          <span>عدد عمليات التبرع</span>
          <span className="font-semibold tabular-nums">
            {formatInteger(point.donationsCount)} عملية
          </span>
        </div>

        {showDisbursements && (
          <>
            <div className="my-1.5 border-t border-[#167764]/10" />
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-[#102A24]/75">
                <span className="h-2.5 w-2.5 shrink-0 rounded-xs bg-[#67B477]" aria-hidden="true" />
                <span>المساعدات المصروفة</span>
              </span>
              <span className="font-bold tabular-nums text-[#32764C]">
                {formatEGP(point.disbursementsExact)} ج.م
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <span className="font-semibold text-[#0F4F42]">صافي الحركة الشهرية</span>
              <span
                className={`font-bold tabular-nums ${
                  netVal >= 0 ? 'text-[#167764]' : 'text-amber-700'
                }`}
              >
                {netVal > 0 ? '+' : ''}
                {formatEGP(point.netBalanceExact)} ج.م
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FinancialChart({
  summary,
  user,
  canRecordDonations = false,
  availableActivities = [],
  submitting = false,
  onRecordDonation,
}: FinancialChartProps) {
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);
  const [chartMode, setChartMode] = useState<'area' | 'bar'>('area');
  const [showDisbursements, setShowDisbursements] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Donation entry form state
  const todayIso = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [donationDate, setDonationDate] = useState(todayIso);
  const [category, setCategory] = useState<DonationCategory>('general_donation');
  const [paymentMethod, setPaymentMethod] = useState<DonationPaymentMethod>('cash');
  const [donorName, setDonorName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activityId, setActivityId] = useState('');
  const [notes, setNotes] = useState('');

  const chartData: ChartDatum[] = useMemo(() => {
    const sliced = summary.monthlySeries.slice(-rangeMonths);
    return sliced.map((pt) => ({
      monthKey: pt.monthKey,
      shortLabelAr: pt.shortLabelAr,
      fullLabelAr: pt.fullLabelAr,
      donations: Number(pt.donationsTotal) || 0,
      donationsExact: pt.donationsTotal,
      donationsCount: pt.donationsCount,
      disbursements: Number(pt.disbursementsTotal) || 0,
      disbursementsExact: pt.disbursementsTotal,
      disbursementsCount: pt.disbursementsCount,
      netBalanceExact: pt.netBalance,
    }));
  }, [summary.monthlySeries, rangeMonths]);

  const periodTotals = useMemo(() => {
    const donationsSum = sumExactMoneyStrings(chartData.map((d) => d.donationsExact));
    const disbursementsSum = sumExactMoneyStrings(chartData.map((d) => d.disbursementsExact));
    const donationsCount = chartData.reduce((acc, d) => acc + d.donationsCount, 0);
    const netSum = Math.round((donationsSum - disbursementsSum) * 100) / 100;
    const coveragePct =
      disbursementsSum > 0 ? Math.round((donationsSum / disbursementsSum) * 100) : null;
    return {
      donationsSum,
      disbursementsSum,
      donationsCount,
      netSum,
      coveragePct,
    };
  }, [chartData]);

  const hasAnyMovement = chartData.some((d) => d.donations > 0 || d.disbursements > 0);
  const total12MNumeric = Number(summary.totalDonations12M) || 0;
  const currentMonthNumeric = Number(summary.currentMonthDonations) || 0;
  const prevMonthNumeric = Number(summary.previousMonthDonations) || 0;
  const momDelta = Math.round((currentMonthNumeric - prevMonthNumeric) * 100) / 100;

  const currentPoint = chartData[chartData.length - 1];

  const handleSubmitDonation = async (e: FormEvent) => {
    e.preventDefault();
    if (!onRecordDonation) return;
    const ok = await onRecordDonation({
      donorName: isAnonymous ? '' : donorName,
      isAnonymous,
      category,
      paymentMethod,
      amount,
      donationDate,
      activityId: activityId || null,
      notes,
    });
    if (ok) {
      setAmount('');
      setDonorName('');
      setIsAnonymous(false);
      setNotes('');
      setShowAddForm(false);
    }
  };

  return (
    <section
      aria-label="الرسم البياني لحركة التبرعات الشهرية والحوكمة المالية"
      className="rounded-3xl border border-[#167764]/14 bg-white p-5 sm:p-6 space-y-5"
    >
      {/* Top Header & Interactive Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold text-[#0F4F42] sm:text-xl">
            حركة التبرعات الشهرية والحوكمة المالية
          </h3>
          <p className="mt-1 text-xs text-[#102A24]/65">
            نطاق الرؤية المالية:{' '}
            <span className="font-semibold text-[#167764]">{summary.scopeLabelAr}</span> · العملة:
            جنيه مصري (ج.م)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Period Range Segmented Control */}
          <div
            role="group"
            aria-label="الفترة الزمنية للرسم البياني"
            className="inline-flex items-center gap-1 rounded-xl bg-[#EEF7F0] p-1"
          >
            <button
              type="button"
              onClick={() => setRangeMonths(6)}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                rangeMonths === 6
                  ? 'bg-[#167764] text-white'
                  : 'text-[#0F4F42]/80 hover:text-[#0F4F42]'
              }`}
            >
              آخر ٦ أشهر
            </button>
            <button
              type="button"
              onClick={() => setRangeMonths(12)}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                rangeMonths === 12
                  ? 'bg-[#167764] text-white'
                  : 'text-[#0F4F42]/80 hover:text-[#0F4F42]'
              }`}
            >
              آخر ١٢ شهراً
            </button>
          </div>

          {/* Chart Type Segmented Control */}
          <div
            role="group"
            aria-label="نمط الرسم البياني"
            className="inline-flex items-center gap-1 rounded-xl bg-[#EEF7F0] p-1"
          >
            <button
              type="button"
              onClick={() => setChartMode('area')}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === 'area'
                  ? 'bg-white text-[#0F4F42] shadow-xs'
                  : 'text-[#0F4F42]/75 hover:text-[#0F4F42]'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>مساحة</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === 'bar'
                  ? 'bg-white text-[#0F4F42] shadow-xs'
                  : 'text-[#0F4F42]/75 hover:text-[#0F4F42]'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>أعمدة</span>
            </button>
          </div>

          {/* Record Real Donation Action (Authorized Roles Only) */}
          {canRecordDonations && onRecordDonation && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#167764] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0F4F42] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{showAddForm ? 'إغلاق التسجيل' : 'تسجيل تبرع'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Record Donation Form (Authorized Roles Only) */}
      {showAddForm && canRecordDonations && onRecordDonation && (
        <form
          onSubmit={handleSubmitDonation}
          className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="font-display text-sm font-extrabold text-[#0F4F42]">
              تسجيل حركة تبرع أو اشتراك فعلي
            </h4>
            <p className="text-xs text-[#102A24]/65">
              يُدرج التبرع فورياً في الرسم البياني وسجل التدقيق المالي.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">قيمة التبرع (ج.م)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums focus:border-[#167764] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">تاريخ التبرع</label>
              <input
                type="date"
                required
                value={donationDate}
                onChange={(e) => setDonationDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm tabular-nums focus:border-[#167764] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">تصنيف التبرع</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DonationCategory)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm focus:border-[#167764] focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {DONATION_CATEGORY_LABELS_AR[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">وسيلة التحصيل</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as DonationPaymentMethod)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm focus:border-[#167764] focus:outline-none"
              >
                {PAYMENT_OPTIONS.map((pm) => (
                  <option key={pm} value={pm}>
                    {PAYMENT_METHOD_LABELS_AR[pm]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">
                اسم المتبرع (أو فاعل خير)
              </label>
              <input
                type="text"
                disabled={isAnonymous}
                value={isAnonymous ? 'متبرع فاعل خير' : donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="اختياري — يُسجل كفاعل خير عند تركه فارغاً"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm disabled:opacity-60 focus:border-[#167764] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">
                النشاط المخصّص له (اختياري)
              </label>
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm focus:border-[#167764] focus:outline-none"
              >
                <option value="">— الصندوق العام للمؤسسة —</option>
                {availableActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">
              ملاحظات أو رقم مرجع التحويل (اختياري)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: إيصال ورقي رقم ٤١٢ أو مرجع تحويل إنستا باي"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm focus:border-[#167764] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex min-h-[40px] items-center gap-2 text-xs font-semibold text-[#0F4F42] cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="h-4 w-4 accent-[#167764]"
              />
              <span>تسجيل التبرع باسم «متبرع فاعل خير»</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'جارٍ التسجيل...' : 'اعتماد وتسجيل التبرع'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-xs font-semibold text-[#102A24] hover:bg-[#EEF7F0] cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Governance Financial KPI Strip (Hairline Separated — No Nested Cards) */}
      <div className="grid grid-cols-1 gap-4 border-y border-[#167764]/10 py-4 sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-[#167764]/10">
        <div className="sm:pl-4">
          <p className="text-xs font-medium text-[#102A24]/65">
            إجمالي التبرعات ({rangeMonths === 6 ? 'آخر ٦ أشهر' : 'آخر ١٢ شهراً'})
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42]">
            {formatEGP(periodTotals.donationsSum)}{' '}
            <span className="text-xs font-bold text-[#167764]">ج.م</span>
          </p>
          <p className="mt-0.5 text-xs text-[#32764C] tabular-nums">
            إجمالي العمليات المسجلة: {formatInteger(periodTotals.donationsCount)} عملية
          </p>
        </div>

        <div className="sm:px-4">
          <p className="text-xs font-medium text-[#102A24]/65">
            تبرعات الشهر الحالي ({currentPoint?.fullLabelAr || summary.currentMonthKey})
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[#0F4F42]">
            {formatEGP(summary.currentMonthDonations)}{' '}
            <span className="text-xs font-bold text-[#167764]">ج.م</span>
          </p>
          <p className="mt-0.5 text-xs text-[#102A24]/65 tabular-nums">
            الشهر السابق: {formatEGP(summary.previousMonthDonations)} ج.م
            {momDelta !== 0 && (
              <span className={momDelta > 0 ? ' text-[#32764C] font-semibold' : ' text-amber-700 font-semibold'}>
                {' '}
                ({momDelta > 0 ? '+' : ''}
                {formatEGP(momDelta)})
              </span>
            )}
          </p>
        </div>

        <div className="sm:pr-4">
          <p className="text-xs font-medium text-[#102A24]/65">
            صافي الحوكمة المالية (التبرعات − الصرف)
          </p>
          <p
            className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${
              periodTotals.netSum >= 0 ? 'text-[#167764]' : 'text-amber-700'
            }`}
          >
            {periodTotals.netSum > 0 ? '+' : ''}
            {formatEGP(periodTotals.netSum)}{' '}
            <span className="text-xs font-bold">ج.م</span>
          </p>
          <p className="mt-0.5 text-xs text-[#102A24]/65 tabular-nums">
            المصروف للفترة: {formatEGP(periodTotals.disbursementsSum)} ج.م
            {periodTotals.coveragePct !== null && ` · نسبة التغطية: ${periodTotals.coveragePct}%`}
          </p>
        </div>
      </div>

      {/* Legend & Disbursements Comparison Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 font-semibold text-[#0F4F42]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#167764]" aria-hidden="true" />
            <span>حركة التبرعات الشهرية (ج.م)</span>
          </span>
          {showDisbursements && (
            <span className="inline-flex items-center gap-2 font-semibold text-[#32764C]">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#67B477]" aria-hidden="true" />
              <span>المساعدات الشهرية المصروفة (ج.م)</span>
            </span>
          )}
        </div>

        <label className="inline-flex min-h-[36px] items-center gap-2 text-xs font-semibold text-[#102A24]/75 cursor-pointer">
          <input
            type="checkbox"
            checked={showDisbursements}
            onChange={(e) => setShowDisbursements(e.target.checked)}
            className="h-4 w-4 accent-[#167764]"
          />
          <span>مقارنة بالمساعدات المصروفة</span>
        </label>
      </div>

      {/* Recharts Interactive Chart Viewport */}
      <div dir="ltr" className="h-[260px] w-full min-w-0 sm:h-[310px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'area' ? (
            <AreaChart data={chartData} margin={{top: 10, right: 12, left: 0, bottom: 4}}>
              <defs>
                <linearGradient id="abwabDonationsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#167764" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="#167764" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="abwabDisbursementsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#67B477" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#67B477" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(22, 119, 100, 0.12)"
              />
              <XAxis
                dataKey="shortLabelAr"
                tick={{fill: '#102A24', fontSize: 12, fontFamily: 'IBM Plex Sans Arabic'}}
                tickLine={false}
                axisLine={{stroke: 'rgba(22, 119, 100, 0.18)'}}
                tickMargin={10}
              />
              <YAxis
                width={56}
                tickFormatter={formatCompactYAxis}
                tick={{fill: '#102A24', fontSize: 11, fontFamily: 'IBM Plex Sans Arabic'}}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                allowDecimals={false}
              />
              <Tooltip
                content={<GovernanceChartTooltip showDisbursements={showDisbursements} />}
                cursor={{stroke: '#167764', strokeWidth: 1, strokeDasharray: '4 4'}}
              />
              <Area
                type="monotone"
                dataKey="donations"
                name="التبرعات الشهرية"
                stroke="#167764"
                strokeWidth={2.5}
                fill="url(#abwabDonationsGradient)"
                activeDot={{r: 5, fill: '#0F4F42', stroke: '#FFFFFF', strokeWidth: 2}}
              />
              {showDisbursements && (
                <Area
                  type="monotone"
                  dataKey="disbursements"
                  name="المساعدات المصروفة"
                  stroke="#32764C"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fill="url(#abwabDisbursementsGradient)"
                  activeDot={{r: 4, fill: '#32764C', stroke: '#FFFFFF', strokeWidth: 2}}
                />
              )}
            </AreaChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{top: 10, right: 12, left: 0, bottom: 4}}
              barGap={6}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(22, 119, 100, 0.12)"
              />
              <XAxis
                dataKey="shortLabelAr"
                tick={{fill: '#102A24', fontSize: 12, fontFamily: 'IBM Plex Sans Arabic'}}
                tickLine={false}
                axisLine={{stroke: 'rgba(22, 119, 100, 0.18)'}}
                tickMargin={10}
              />
              <YAxis
                width={56}
                tickFormatter={formatCompactYAxis}
                tick={{fill: '#102A24', fontSize: 11, fontFamily: 'IBM Plex Sans Arabic'}}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                allowDecimals={false}
              />
              <Tooltip
                content={<GovernanceChartTooltip showDisbursements={showDisbursements} />}
                cursor={{fill: 'rgba(238, 247, 240, 0.65)'}}
              />
              <Bar
                dataKey="donations"
                name="التبرعات الشهرية"
                fill="#167764"
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
              />
              {showDisbursements && (
                <Bar
                  dataKey="disbursements"
                  name="المساعدات المصروفة"
                  fill="#67B477"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={30}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Zero-Data Authentic Governance Note */}
      {!hasAnyMovement && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-[#167764]/20 bg-[#F7FAF8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#0F4F42]">
              لا توجد حركات تبرعات أو صرف مسجلة في هذه الفترة حتى الآن
            </p>
            <p className="mt-0.5 text-xs text-[#102A24]/70">
              يعرض الرسم البياني البيانات الفعلية المسجلة فقط بدءاً من 0.00 ج.م دون أي أرقام
              افتراضية حفاظاً على دقة الحوكمة المالية.
            </p>
          </div>
          {canRecordDonations && onRecordDonation && !showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>تسجيل أول تبرع فعلي</span>
            </button>
          )}
        </div>
      )}

      {/* Donation Categories Distribution Footer (Only When Real Donations Exist) */}
      {total12MNumeric > 0 && (
        <div className="border-t border-[#167764]/10 pt-4">
          <p className="text-xs font-bold text-[#0F4F42]">
            توزيع التبرعات حسب التصنيف (آخر ١٢ شهراً)
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summary.byCategory.map((cat) => {
              const val = Number(cat.total) || 0;
              const pct =
                total12MNumeric > 0 ? Math.min(100, Math.round((val / total12MNumeric) * 100)) : 0;
              return (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#102A24]/85 truncate">{cat.labelAr}</span>
                    <span className="font-bold tabular-nums text-[#167764]">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF7F0]">
                    <div
                      className="h-full rounded-full bg-[#32764C] transition-all duration-300"
                      style={{width: `${pct}%`}}
                    />
                  </div>
                  <p className="text-[11px] text-[#102A24]/65 tabular-nums">
                    {formatEGP(cat.total)} ج.م · {formatInteger(cat.count)} عملية
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
