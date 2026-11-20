import {
  HandHeart,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Users,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {api, ApiError, type DonorSummaryRow} from '../../lib/api';
import {buildDonationReceiptHtml} from '../../lib/exportUtils';
import {formatEGP, formatInteger} from '../../lib/formatters';
import {
  DONATION_CATEGORY_LABELS_AR,
  FUND_POOL_LABELS_AR,
  PAYMENT_METHOD_LABELS_AR,
  WAREHOUSE_CATEGORY_LABELS_AR,
  WAREHOUSE_CONDITION_LABELS_AR,
  type AuthUser,
  type CharityActivity,
  type DonationCategory,
  type DonationPaymentMethod,
  type DonationRecord,
  type OrganizationSettings,
  type RolePermissionMatrix,
  type TreasuryAccount,
  type WarehouseCategory,
  type WarehouseCondition,
} from '../../types/auth';
import {ArabicPrintModal} from './ArabicPrintModal';

interface DonationsPanelProps {
  user: AuthUser;
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

const ALL_DONATION_CATEGORIES: DonationCategory[] = [
  'monthly_subscription',
  'sadaqah',
  'zakat',
  'zakat_fitr',
  'general_donation',
  'campaign',
  'in_kind',
];

const PAYMENT_METHODS: DonationPaymentMethod[] = [
  'cash',
  'bank_transfer',
  'instapay',
  'wallet',
  'in_kind',
];

export function DonationsPanel({
  user,
  permissions,
  onFeedback,
  onDataChanged,
}: DonationsPanelProps) {
  const [viewMode, setViewMode] = useState<'donations' | 'donors'>('donations');
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [donors, setDonors] = useState<DonorSummaryRow[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [projects, setProjects] = useState<Array<{id: string; code: string; name: string}>>([]);
  const [activities, setActivities] = useState<CharityActivity[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [category, setCategory] = useState<DonationCategory>('sadaqah');
  const [paymentMethod, setPaymentMethod] = useState<DonationPaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [donationDate, setDonationDate] = useState(new Date().toISOString().slice(0, 10));
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [inKindDescription, setInKindDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Optional auto warehouse receipt for in_kind
  const [addToWarehouse, setAddToWarehouse] = useState(true);
  const [whItemName, setWhItemName] = useState('');
  const [whCategory, setWhCategory] = useState<WarehouseCategory>('clothing');
  const [whCondition, setWhCondition] = useState<WarehouseCondition>('new');
  const [whQuantity, setWhQuantity] = useState('1');
  const [whUnit, setWhUnit] = useState('قطعة');

  // PDF Receipt Modal
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState('');

  const loadDonations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDonations();
      setDonations(res.donations);
      setDonors(res.donors);
      setAccounts(res.treasuryAccounts);
      setProjects(res.projects);
      setActivities(res.activities);
      setOrgSettings(res.organizationSettings);
      if (res.treasuryAccounts.length > 0) {
        setTreasuryAccountId((prev) => prev || res.treasuryAccounts[0].id);
      }
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل سجل التبرعات.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadDonations();
  }, [loadDonations]);

  const filteredDonations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return donations.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        d.receiptNumber.toLowerCase().includes(q) ||
        d.donorName.toLowerCase().includes(q) ||
        d.donorPhone.toLowerCase().includes(q) ||
        (d.projectName || '').toLowerCase().includes(q)
      );
    });
  }, [donations, searchQuery, categoryFilter]);

  const isInKind = category === 'in_kind';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createDonation({
        donorName: isAnonymous ? '' : donorName,
        donorPhone: isAnonymous ? '' : donorPhone,
        isAnonymous,
        category,
        paymentMethod: isInKind ? 'in_kind' : paymentMethod,
        amount: isInKind ? amount || '0.00' : amount,
        donationDate,
        treasuryAccountId: isInKind ? null : treasuryAccountId || null,
        projectId: projectId || null,
        activityId: activityId || null,
        inKindDescription: isInKind ? inKindDescription : '',
        notes,
        warehouseInbound:
          isInKind && addToWarehouse && whItemName.trim()
            ? {
                itemName: whItemName.trim(),
                category: whCategory,
                condition: whCondition,
                quantity: Math.max(1, Number(whQuantity) || 1),
                unit: whUnit.trim() || 'قطعة',
              }
            : undefined,
      });

      setDonorName('');
      setDonorPhone('');
      setAmount('');
      setInKindDescription('');
      setWhItemName('');
      setNotes('');
      setShowAddForm(false);

      onFeedback({
        type: 'success',
        text: `تم تسجيل التبرع بنجاح وإصدار إيصال رقم ${res.donation.receiptNumber}.`,
      });
      await loadDonations();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تسجيل التبرع.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openReceiptPdf = (donation: DonationRecord) => {
    setPrintTitle(`إيصال تبرع رسمي — ${donation.receiptNumber}`);
    setPrintHtml(buildDonationReceiptHtml(donation, orgSettings));
  };

  return (
    <div className="space-y-6">
      {/* Header & View Switcher */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إدارة التبرعات وسجل المتبرعين
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              دعم كافة أنواع التبرعات النقدية والعينية مع التوجيه التلقائي لصناديق الزكاة والصدقات وإصدار إيصال PDF عربي.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-[#EEF7F0] p-1">
              <button
                type="button"
                onClick={() => setViewMode('donations')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  viewMode === 'donations' ? 'bg-[#167764] text-white' : 'text-[#0F4F42]'
                }`}
              >
                <HandHeart className="h-3.5 w-3.5" aria-hidden="true" />
                <span>سجل التبرعات ({formatInteger(donations.length)})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('donors')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  viewMode === 'donors' ? 'bg-[#167764] text-white' : 'text-[#0F4F42]'
                }`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>دليل المتبرعين ({formatInteger(donors.length)})</span>
              </button>
            </div>

            {permissions.canAddData && (
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{showAddForm ? 'إغلاق' : 'تسجيل تبرع جديد'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Add Donation Form */}
        {showAddForm && permissions.canAddData && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
          >
            <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
              تسجيل عملية تبرع وإصدار إيصال رسمي
            </h3>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">نوع التبرع *</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const nextCat = e.target.value as DonationCategory;
                    setCategory(nextCat);
                    if (nextCat === 'in_kind') setPaymentMethod('in_kind');
                    else if (paymentMethod === 'in_kind') setPaymentMethod('cash');
                  }}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {ALL_DONATION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {DONATION_CATEGORY_LABELS_AR[c]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  {isInKind ? 'القيمة التقديرية (ج.م — اختياري)' : 'قيمة التبرع (ج.م) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={isInKind ? '0' : '0.01'}
                  required={!isInKind}
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">تاريخ التبرع *</label>
                <input
                  type="date"
                  required
                  value={donationDate}
                  onChange={(e) => setDonationDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">اسم المتبرع</label>
                <input
                  type="text"
                  disabled={isAnonymous}
                  value={isAnonymous ? 'متبرع فاعل خير' : donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="يُسجل فاعل خير عند تركه فارغاً"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">رقم الهاتف (اختياري)</label>
                <input
                  type="tel"
                  dir="ltr"
                  disabled={isAnonymous}
                  value={isAnonymous ? '' : donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums disabled:opacity-60"
                />
              </div>

              {!isInKind && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#0F4F42]">طريقة الدفع</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as DonationPaymentMethod)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                    >
                      {PAYMENT_METHODS.filter((m) => m !== 'in_kind').map((pm) => (
                        <option key={pm} value={pm}>
                          {PAYMENT_METHOD_LABELS_AR[pm]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F4F42]">
                      الخزينة / الحساب البنكي المستلم
                    </label>
                    <select
                      value={treasuryAccountId}
                      onChange={(e) => setTreasuryAccountId(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatEGP(acc.currentBalance)} ج.م)
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  مشروع خيري مخصص (اختياري)
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— غير مخصص لمشروع محدد —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {activities.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">النشاط (اختياري)</label>
                  <select
                    value={activityId}
                    onChange={(e) => setActivityId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— الصندوق العام —</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {isInKind && (
              <div className="rounded-2xl border border-[#167764]/18 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F4F42]">
                    <PackagePlus className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                    <span>تفاصيل التبرع العيني والإضافة التلقائية للمخزن</span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToWarehouse}
                      onChange={(e) => setAddToWarehouse(e.target.checked)}
                      className="h-4 w-4 accent-[#167764]"
                    />
                    <span>إدخال تلقائي بالمخزن</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={inKindDescription}
                  onChange={(e) => setInKindDescription(e.target.value)}
                  placeholder="وصف التبرع العيني (مثال: ٣٠ بطانية شتوية جديدة أو جهاز تنفس)"
                  className="min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2 text-sm"
                />
                {addToWarehouse && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <input
                      type="text"
                      required
                      value={whItemName}
                      onChange={(e) => setWhItemName(e.target.value)}
                      placeholder="اسم الصنف بالمخزن *"
                      className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-1.5 text-xs lg:col-span-2"
                    />
                    <select
                      value={whCategory}
                      onChange={(e) => setWhCategory(e.target.value as WarehouseCategory)}
                      className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-2.5 py-1.5 text-xs"
                    >
                      {(Object.keys(WAREHOUSE_CATEGORY_LABELS_AR) as WarehouseCategory[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {WAREHOUSE_CATEGORY_LABELS_AR[k]}
                          </option>
                        ),
                      )}
                    </select>
                    <select
                      value={whCondition}
                      onChange={(e) => setWhCondition(e.target.value as WarehouseCondition)}
                      className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-2.5 py-1.5 text-xs"
                    >
                      {(Object.keys(WAREHOUSE_CONDITION_LABELS_AR) as WarehouseCondition[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {WAREHOUSE_CONDITION_LABELS_AR[k]}
                          </option>
                        ),
                      )}
                    </select>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={1}
                        required
                        value={whQuantity}
                        onChange={(e) => setWhQuantity(e.target.value)}
                        className="min-h-[42px] w-20 rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-2.5 py-1.5 text-xs tabular-nums"
                      />
                      <input
                        type="text"
                        value={whUnit}
                        onChange={(e) => setWhUnit(e.target.value)}
                        placeholder="الوحدة"
                        className="min-h-[42px] flex-1 rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">ملاحظات إضافية</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="رقم مرجع التحويل أو أي تفاصيل إضافية..."
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex min-h-[40px] items-center gap-2 text-xs font-bold text-[#0F4F42] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="h-4 w-4 accent-[#167764]"
                />
                <span>تسجيل المتبرع باسم «متبرع فاعل خير»</span>
              </label>

              <div className="flex gap-2">
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
                  {submitting ? 'جارٍ التسجيل...' : 'حفظ التبرع وإصدار الإيصال'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Filter Bar */}
        {viewMode === 'donations' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#167764]/70"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الإيصال، اسم المتبرع، أو المشروع..."
                className="min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] pr-10 pl-3 py-2 text-sm"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="تصفية حسب نوع التبرع"
              className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-sm"
            >
              <option value="all">كل أنواع التبرعات</option>
              {ALL_DONATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DONATION_CATEGORY_LABELS_AR[c]}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Donations List vs Donors Directory */}
      {loading ? (
        <div className="h-44 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : viewMode === 'donations' ? (
        filteredDonations.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
            <p className="font-display text-base font-bold text-[#0F4F42]">
              لا توجد تبرعات مسجلة حتى الآن
            </p>
            <p className="mt-1 text-xs text-[#102A24]/65">
              عند تسجيل أول تبرع يظهر هنا مع رقم إيصال تلقائي وقابلية طباعة إيصال PDF عربي.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredDonations.map((d) => (
              <article
                key={d.id}
                className="rounded-3xl border border-[#167764]/14 bg-white p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-bold text-[#167764] tabular-nums">
                    {d.receiptNumber} · {d.donationDate} · {DONATION_CATEGORY_LABELS_AR[d.category]}
                  </p>
                  <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
                    {d.donorName}
                    {d.donorPhone ? (
                      <span className="mr-2 text-xs font-normal text-[#102A24]/65" dir="ltr">
                        ({d.donorPhone})
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-[#102A24]/70">
                    {FUND_POOL_LABELS_AR[d.fundType]} · {PAYMENT_METHOD_LABELS_AR[d.paymentMethod]}
                    {d.treasuryAccountName ? ` · ${d.treasuryAccountName}` : ''}
                    {d.projectName ? ` · مشروع: ${d.projectName}` : ''}
                  </p>
                  {d.inKindDescription && (
                    <p className="text-xs font-medium text-[#32764C]">
                      تبرع عيني: {d.inKindDescription}
                    </p>
                  )}
                  <p className="text-[11px] text-[#102A24]/55">المسجّل: {d.recordedByName}</p>
                </div>

                <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end shrink-0">
                  <p className="font-display text-xl font-extrabold tabular-nums text-[#0F4F42]">
                    {d.category === 'in_kind' && Number(d.amount) === 0
                      ? 'تبرع عيني'
                      : `${formatEGP(d.amount)} ج.م`}
                  </p>
                  <button
                    type="button"
                    onClick={() => openReceiptPdf(d)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#167764]/22 bg-[#F7FAF8] px-3.5 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                  >
                    <Printer className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                    <span>إيصال PDF عربي</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : donors.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <p className="font-display text-base font-bold text-[#0F4F42]">سجل المتبرعين فارغ حالياً</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {donors.map((donor, idx) => (
            <article
              key={`${donor.donorName}-${idx}`}
              className="rounded-3xl border border-[#167764]/14 bg-white p-5 space-y-2"
            >
              <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
                {donor.donorName}
              </h3>
              <p className="text-xs text-[#102A24]/65" dir="ltr">
                {donor.donorPhone || 'بدون رقم هاتف مسجل'}
              </p>
              <div className="border-t border-[#167764]/10 pt-3 flex items-center justify-between text-xs">
                <span className="text-[#102A24]/70 tabular-nums">
                  {formatInteger(donor.donationsCount)} تبرع · آخرها {donor.lastDonationDate}
                </span>
                <span className="font-display text-sm font-extrabold tabular-nums text-[#167764]">
                  {formatEGP(donor.totalMonetary)} ج.م
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <ArabicPrintModal
        open={Boolean(printHtml)}
        titleAr={printTitle}
        htmlContent={printHtml || ''}
        onClose={() => setPrintHtml(null)}
      />
    </div>
  );
}
