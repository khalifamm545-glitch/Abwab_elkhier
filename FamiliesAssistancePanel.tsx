import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  History,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {useMemo, useState, type ChangeEvent, type FormEvent} from 'react';
import {api, ApiError, getPrivateFileUrl} from '../../lib/api';
import {
  formatArabicDateTime,
  formatArabicMonthKey,
  formatEGP,
  formatInteger,
} from '../../lib/formatters';
import {
  ECONOMIC_STATUS_LABELS_AR,
  ELIGIBILITY_LABELS_AR,
  FAMILY_APPROVAL_LABELS_AR,
  FINANCIAL_PURPOSE_LABELS_AR,
  MARITAL_STATUS_LABELS_AR,
  SUPPORT_TYPE_LABELS_AR,
  type AssistanceSupportType,
  type AuthUser,
  type BeneficiaryFamilyRecord,
  type CharityActivity,
  type FamilyApprovalStatus,
  type FamilyAssistanceHistory,
  type FamilyEconomicStatus,
  type FamilyEligibilityStatus,
  type FamilyMaritalStatus,
  type MonthlyAssistanceDisbursement,
  type RolePermissionMatrix,
} from '../../types/auth';
import {ConfirmDialog} from './ConfirmDialog';

interface FamiliesAssistancePanelProps {
  user: AuthUser;
  permissions: RolePermissionMatrix;
  families: BeneficiaryFamilyRecord[];
  disbursements: MonthlyAssistanceDisbursement[];
  activities: CharityActivity[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
}

export function FamiliesAssistancePanel({
  user,
  permissions,
  families,
  disbursements,
  activities,
  loading,
  onRefresh,
  onFeedback,
}: FamiliesAssistancePanelProps) {
  const currentMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('all');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');

  // Create family form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [headOfHousehold, setHeadOfHousehold] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [membersCount, setMembersCount] = useState('4');
  const [maritalStatus, setMaritalStatus] = useState<FamilyMaritalStatus>('married');
  const [economicStatus, setEconomicStatus] = useState<FamilyEconomicStatus>('low_income');
  const [incomeSource, setIncomeSource] = useState('');
  const [eligibilityStatus, setEligibilityStatus] = useState<FamilyEligibilityStatus>('eligible');
  const [supportType, setSupportType] = useState<AssistanceSupportType>('monthly_pension');
  const [monthlyAssistanceEnabled, setMonthlyAssistanceEnabled] = useState(true);
  const [monthlyAssistanceAmount, setMonthlyAssistanceAmount] = useState('1000.00');
  const [activityId, setActivityId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sensitive National ID revealed cache (per session view only)
  const [revealedNids, setRevealedNids] = useState<Record<string, string>>({});

  // Social research modal state
  const [researchTarget, setResearchTarget] = useState<BeneficiaryFamilyRecord | null>(null);
  const [researchText, setResearchText] = useState('');
  const [researchDecision, setResearchDecision] = useState<FamilyApprovalStatus>('approved');
  const [researchEligibility, setResearchEligibility] =
    useState<FamilyEligibilityStatus>('eligible');

  // Family assistance history drawer state
  const [historyData, setHistoryData] = useState<FamilyAssistanceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<BeneficiaryFamilyRecord | null>(null);

  // Quick disburse state
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);

  const filteredFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return families.filter((f) => {
      if (eligibilityFilter !== 'all' && f.eligibilityStatus !== eligibilityFilter) return false;
      if (approvalFilter !== 'all' && f.approvalStatus !== approvalFilter) return false;
      if (!q) return true;
      return (
        f.headOfHousehold.toLowerCase().includes(q) ||
        f.fileNumber.toLowerCase().includes(q) ||
        f.phone.toLowerCase().includes(q) ||
        f.governorate.toLowerCase().includes(q) ||
        f.address.toLowerCase().includes(q)
      );
    });
  }, [families, searchQuery, eligibilityFilter, approvalFilter]);

  const paidInSelectedMonth = useMemo(() => {
    const set = new Set<string>();
    for (const d of disbursements) {
      if (d.monthKey === selectedMonthKey) set.add(d.familyId);
    }
    return set;
  }, [disbursements, selectedMonthKey]);

  const canRevealNationalId = permissions.canManageFamilies && permissions.canViewData;

  const handleCreateFamily = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createFamily({
        headOfHousehold,
        nationalId,
        governorate,
        address,
        phone,
        membersCount: Number(membersCount),
        maritalStatus,
        economicStatus,
        incomeSource,
        eligibilityStatus,
        supportType,
        monthlyAssistanceEnabled,
        monthlyAssistanceAmount: monthlyAssistanceEnabled ? monthlyAssistanceAmount : '0.00',
        activityId: activityId || null,
        notes,
      });
      setHeadOfHousehold('');
      setNationalId('');
      setGovernorate('');
      setAddress('');
      setPhone('');
      setMembersCount('4');
      setIncomeSource('');
      setNotes('');
      setShowCreateForm(false);
      onFeedback({type: 'success', text: 'تم تسجيل ملف الأسرة المستفيدة بنجاح وتشفير الرقم القومي.'});
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تسجيل ملف الأسرة.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevealNationalId = async (familyId: string) => {
    if (revealedNids[familyId]) {
      setRevealedNids((prev) => {
        const next = {...prev};
        delete next[familyId];
        return next;
      });
      return;
    }
    try {
      const res = await api.revealFamilyNationalId(familyId);
      setRevealedNids((prev) => ({...prev, [familyId]: res.nationalId}));
      onFeedback({
        type: 'success',
        text: 'تم كشف الرقم القومي المشفّر وتوثيق عملية الاطلاع في سجل المراجعة.',
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر كشف الرقم القومي.',
      });
    }
  };

  const handleSubmitSocialResearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!researchTarget) return;
    setSubmitting(true);
    try {
      await api.submitSocialResearch(researchTarget.id, {
        socialResearchResult: researchText,
        approvalStatus: researchDecision,
        eligibilityStatus: researchEligibility,
      });
      setResearchTarget(null);
      setResearchText('');
      onFeedback({type: 'success', text: 'تم اعتماد نتيجة البحث الاجتماعي وتحديث حالة الأسرة.'});
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر حفظ نتيجة البحث الاجتماعي.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenHistory = async (familyId: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.getFamilyHistory(familyId);
      setHistoryData(res);
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل سجل المساعدات للأسرة.',
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleUploadAttachment = async (
    familyId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      onFeedback({type: 'error', text: 'الحد الأقصى لحجم المستند المرفق هو 4.5 ميجابايت.'});
      return;
    }
    setSubmitting(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة الملف المختار.'));
        reader.readAsDataURL(file);
      });
      await api.uploadFamilyAttachment(familyId, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      });
      onFeedback({type: 'success', text: `تم رفع المستند المحمي (${file.name}) بنجاح.`});
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر رفع المستند.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDisburse = async (family: BeneficiaryFamilyRecord) => {
    setSubmitting(true);
    try {
      await api.recordDisbursement({
        familyId: family.id,
        monthKey: selectedMonthKey,
        amount: family.monthlyAssistanceAmount,
      });
      onFeedback({
        type: 'success',
        text: `تم تسجيل صرف المساعدة الشهرية للأسرة (${family.fileNumber}) عن ${formatArabicMonthKey(selectedMonthKey)}.`,
      });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تسجيل الصرف الشهري.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.deleteFamily(deleteTarget.id);
      setDeleteTarget(null);
      onFeedback({type: 'success', text: 'تم حذف ملف الأسرة بنجاح.'});
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر حذف ملف الأسرة.',
      });
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إدارة الأسر المستفيدة والبحث الاجتماعي
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              ملفات شاملة برقم ملف تلقائي وتشفير الرقم القومي (AES-256) وسجل مساعدات متكامل ومرفقات محمية.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              aria-label="شهر الصرف"
              className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-xs font-bold text-[#0F4F42] tabular-nums"
            />
            {permissions.canAddData && (
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{showCreateForm ? 'إغلاق نموذج الإضافة' : 'تسجيل أسرة جديدة'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Classification Filter Bar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#167764]/70"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، رقم الملف، الهاتف، أو المحافظة..."
              className="min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] pr-10 pl-3 py-2 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value)}
            aria-label="تصفية حسب قرار البحث الاجتماعي"
            className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
          >
            <option value="all">كل حالات الاعتماد الاجتماعي</option>
            <option value="approved">معتمدة للاستحقاق</option>
            <option value="pending_review">تحت المراجعة الاجتماعية</option>
            <option value="rejected">مرفوضة</option>
          </select>
          <select
            value={eligibilityFilter}
            onChange={(e) => setEligibilityFilter(e.target.value)}
            aria-label="تصفية حسب الأهلية"
            className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
          >
            <option value="all">كل تصنيفات الأهلية</option>
            <option value="priority">أولوية قصوى</option>
            <option value="eligible">مستحقة</option>
            <option value="pending_review">قيد المراجعة</option>
            <option value="suspended">موقوفة مؤقتاً</option>
          </select>
        </div>

        {/* Create Family Form */}
        {showCreateForm && permissions.canAddData && (
          <form
            onSubmit={handleCreateFamily}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
          >
            <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
              بيانات ملف الأسرة المستفيدة الجديدة
            </h3>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">اسم رب الأسرة *</label>
                <input
                  type="text"
                  required
                  value={headOfHousehold}
                  onChange={(e) => setHeadOfHousehold(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  الرقم القومي (يُشفّر تلقائياً)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={14}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="١٤ رقماً"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">رقم الهاتف *</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">المحافظة / المنطقة *</label>
                <input
                  type="text"
                  required
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  placeholder="مثال: القاهرة — حلوان"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#0F4F42]">العنوان التفصيلي</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="الشارع، رقم العقار، أقرب معلم"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">عدد أفراد الأسرة *</label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  required
                  value={membersCount}
                  onChange={(e) => setMembersCount(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الحالة الاجتماعية</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as FamilyMaritalStatus)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {(Object.keys(MARITAL_STATUS_LABELS_AR) as FamilyMaritalStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {MARITAL_STATUS_LABELS_AR[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الحالة الاقتصادية</label>
                <select
                  value={economicStatus}
                  onChange={(e) => setEconomicStatus(e.target.value as FamilyEconomicStatus)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {(Object.keys(ECONOMIC_STATUS_LABELS_AR) as FamilyEconomicStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {ECONOMIC_STATUS_LABELS_AR[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">مصدر الدخل (إن وجد)</label>
                <input
                  type="text"
                  value={incomeSource}
                  onChange={(e) => setIncomeSource(e.target.value)}
                  placeholder="مثال: معاش تكافل وكرامة / عمالة غير منتظمة"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">تصنيف الأهلية</label>
                <select
                  value={eligibilityStatus}
                  onChange={(e) => setEligibilityStatus(e.target.value as FamilyEligibilityStatus)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {(Object.keys(ELIGIBILITY_LABELS_AR) as FamilyEligibilityStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {ELIGIBILITY_LABELS_AR[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">نوع الدعم الأساسي</label>
                <select
                  value={supportType}
                  onChange={(e) => setSupportType(e.target.value as AssistanceSupportType)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                >
                  {(Object.keys(SUPPORT_TYPE_LABELS_AR) as AssistanceSupportType[]).map((k) => (
                    <option key={k} value={k}>
                      {SUPPORT_TYPE_LABELS_AR[k]}
                    </option>
                  ))}
                </select>
              </div>
              {activities.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-[#0F4F42]">النشاط المرتبط</label>
                  <select
                    value={activityId}
                    onChange={(e) => setActivityId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— عام بالجمعية —</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  قيمة الدعم الشهري (ج.م)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  dir="ltr"
                  disabled={!monthlyAssistanceEnabled}
                  value={monthlyAssistanceAmount}
                  onChange={(e) => setMonthlyAssistanceAmount(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-left text-sm tabular-nums disabled:opacity-50"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-[#0F4F42]">
                  ملاحظات الحالة الاجتماعية والطبية
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تفاصيل مهمة للباحث الاجتماعي أو لجنة الاعتماد..."
                  className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex min-h-[40px] items-center gap-2 text-xs font-bold text-[#0F4F42] cursor-pointer">
                <input
                  type="checkbox"
                  checked={monthlyAssistanceEnabled}
                  onChange={(e) => setMonthlyAssistanceEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#167764]"
                />
                <span>إدراج الأسرة ضمن المساعدات الشهرية المجدولة</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'جارٍ الحفظ...' : 'حفظ ملف الأسرة'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-xs font-semibold text-[#102A24] cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Families Mobile-First Cards List */}
      {loading && families.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
          ))}
        </div>
      ) : filteredFamilies.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/22 bg-white p-8 text-center">
          <p className="font-display text-base font-bold text-[#0F4F42]">
            {families.length === 0
              ? 'لا توجد أسر مستفيدة مسجلة حتى الآن'
              : 'لا توجد أسر مطابقة لمعايير البحث الحالية'}
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65">
            تبدأ قاعدة بيانات الأسر نظيفة وتُملأ بالملفات الفعلية المعتمدة فقط.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredFamilies.map((fam) => {
            const isPaid = paidInSelectedMonth.has(fam.id);
            const revealed = revealedNids[fam.id];

            return (
              <article
                key={fam.id}
                className="rounded-3xl border border-[#167764]/14 bg-white p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#167764] tabular-nums">
                      {fam.fileNumber} · {FAMILY_APPROVAL_LABELS_AR[fam.approvalStatus]}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-extrabold text-[#0F4F42]">
                      {fam.headOfHousehold}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#102A24]/70">
                      {fam.governorate}
                      {fam.address ? ` — ${fam.address}` : ''} · {formatInteger(fam.membersCount)}{' '}
                      أفراد
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-display text-lg font-extrabold tabular-nums text-[#0F4F42]">
                      {fam.monthlyAssistanceEnabled
                        ? `${formatEGP(fam.monthlyAssistanceAmount)} ج.م`
                        : 'بدون معاش شهري'}
                    </p>
                    <p className="text-[11px] font-semibold text-[#32764C]">
                      {ELIGIBILITY_LABELS_AR[fam.eligibilityStatus]} ·{' '}
                      {SUPPORT_TYPE_LABELS_AR[fam.supportType]}
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 gap-2 rounded-2xl bg-[#F7FAF8] p-3.5 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-[#102A24]/60">الرقم القومي: </span>
                    <span className="font-bold text-[#0F4F42] tabular-nums" dir="ltr">
                      {revealed || fam.nationalIdMasked}
                    </span>
                    {fam.hasNationalId && canRevealNationalId && (
                      <button
                        type="button"
                        onClick={() => handleRevealNationalId(fam.id)}
                        className="mr-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#167764] underline cursor-pointer"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>{revealed ? 'إخفاء' : 'كشف'}</span>
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="text-[#102A24]/60">الهاتف: </span>
                    <span className="font-bold text-[#0F4F42] tabular-nums" dir="ltr">
                      {fam.phone}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#102A24]/60">الحالة الاجتماعية: </span>
                    <span className="font-semibold text-[#102A24]">
                      {MARITAL_STATUS_LABELS_AR[fam.maritalStatus]}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#102A24]/60">الوضع الاقتصادي: </span>
                    <span className="font-semibold text-[#102A24]">
                      {ECONOMIC_STATUS_LABELS_AR[fam.economicStatus]}
                    </span>
                  </div>
                  {fam.incomeSource && (
                    <div className="sm:col-span-2">
                      <span className="text-[#102A24]/60">مصدر الدخل: </span>
                      <span className="font-semibold text-[#102A24]">{fam.incomeSource}</span>
                    </div>
                  )}
                  {fam.socialResearchResult && (
                    <div className="sm:col-span-2 border-t border-[#167764]/10 pt-2">
                      <span className="font-bold text-[#167764]">نتيجة البحث الاجتماعي: </span>
                      <span className="text-[#102A24]/85">{fam.socialResearchResult}</span>
                      {fam.socialResearchByName && (
                        <span className="block mt-0.5 text-[11px] text-[#102A24]/60">
                          المعتمد: {fam.socialResearchByName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Attachments Row */}
                {fam.attachments && fam.attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-[#0F4F42] flex items-center gap-1">
                      <Paperclip className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                      <span>المستندات المرفقة ({fam.attachments.length}):</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {fam.attachments.map((doc) => (
                        <a
                          key={doc.id}
                          href={getPrivateFileUrl(doc.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#167764]/18 bg-[#EEF7F0]/60 px-3 py-1 text-xs font-semibold text-[#0F4F42] hover:bg-[#EEF7F0]"
                        >
                          <Download className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                          <span className="max-w-[160px] truncate">{doc.fileName}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 border-t border-[#167764]/10 pt-3">
                  {fam.monthlyAssistanceEnabled &&
                    permissions.canRecordMonthlyAssistance &&
                    fam.approvalStatus !== 'rejected' && (
                      <button
                        type="button"
                        disabled={isPaid || submitting}
                        onClick={() => handleQuickDisburse(fam)}
                        className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                          isPaid
                            ? 'bg-[#EEF7F0] text-[#32764C] cursor-default'
                            : 'bg-[#167764] text-white hover:bg-[#0F4F42]'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {isPaid
                            ? `تم الصرف (${selectedMonthKey})`
                            : `صرف دعم (${selectedMonthKey})`}
                        </span>
                      </button>
                    )}

                  {permissions.canApproveTransactions && (
                    <button
                      type="button"
                      onClick={() => {
                        setResearchTarget(fam);
                        setResearchText(fam.socialResearchResult || '');
                        setResearchDecision(fam.approvalStatus);
                        setResearchEligibility(fam.eligibilityStatus);
                      }}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      <ClipboardCheck className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                      <span>البحث والاعتماد</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenHistory(fam.id)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                  >
                    <History className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                    <span>سجل المساعدات</span>
                  </button>

                  {permissions.canAddData && (
                    <label className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer">
                      <Upload className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                      <span>إرفاق مستند</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        className="sr-only"
                        onChange={(e) => handleUploadAttachment(fam.id, e)}
                      />
                    </label>
                  )}

                  {permissions.canDeleteData && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(fam)}
                        className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 cursor-pointer"
                        aria-label={`حذف ملف ${fam.headOfHousehold}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>حذف</span>
                      </button>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Social Research & Approval Modal */}
      {researchTarget && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A24]/45 p-3 backdrop-blur-xs sm:items-center"
        >
          <form
            onSubmit={handleSubmitSocialResearch}
            className="w-full max-w-lg rounded-3xl border border-[#167764]/20 bg-white p-5 shadow-xl sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#167764]" aria-hidden="true" />
                <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
                  اعتماد نتيجة البحث الاجتماعي — {researchTarget.fileNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResearchTarget(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#EEF7F0] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#102A24]/70">
              رب الأسرة: <strong className="text-[#0F4F42]">{researchTarget.headOfHousehold}</strong>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">قرار الاعتماد</label>
                <select
                  value={researchDecision}
                  onChange={(e) => setResearchDecision(e.target.value as FamilyApprovalStatus)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-sm"
                >
                  <option value="approved">اعتماد الاستحقاق (مقبولة)</option>
                  <option value="pending_review">إبقاء قيد المراجعة</option>
                  <option value="rejected">رفض الملف</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">تصنيف الأهلية</label>
                <select
                  value={researchEligibility}
                  onChange={(e) =>
                    setResearchEligibility(e.target.value as FamilyEligibilityStatus)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-sm"
                >
                  {(Object.keys(ELIGIBILITY_LABELS_AR) as FamilyEligibilityStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {ELIGIBILITY_LABELS_AR[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">
                خلاصة البحث الميداني والتوصية *
              </label>
              <textarea
                rows={4}
                required
                value={researchText}
                onChange={(e) => setResearchText(e.target.value)}
                placeholder="نتائج المعاينة الميدانية، وضع السكن والدخل، وتوصية لجنة البحث..."
                className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResearchTarget(null)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'جارٍ الاعتماد...' : 'حفظ قرار البحث الاجتماعي'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Family Full Assistance History Drawer */}
      {(historyData || historyLoading) && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A24]/45 p-2 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#167764]/20 bg-white p-5 shadow-2xl sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 border-b border-[#167764]/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#167764]" aria-hidden="true" />
                <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
                  سجل المساعدات التاريخي للأسرة
                  {historyData ? ` — ${historyData.family.headOfHousehold}` : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryData(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#EEF7F0] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {historyLoading || !historyData ? (
              <p className="py-8 text-center text-sm text-[#102A24]/65">جارٍ تحميل سجل المساعدات...</p>
            ) : (
              <div className="space-y-5 text-sm">
                <div>
                  <h4 className="font-display text-sm font-bold text-[#0F4F42]">
                    ١. دفعات معاشات الخير والمساعدات الشهرية ({historyData.pensionDisbursements.length})
                  </h4>
                  {historyData.pensionDisbursements.length === 0 ? (
                    <p className="mt-1.5 text-xs text-[#102A24]/60">لا توجد دفعات شهرية مسجلة.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-[#167764]/10 rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] px-3.5">
                      {historyData.pensionDisbursements.map((d) => (
                        <div key={d.id} className="flex items-center justify-between py-2.5 text-xs">
                          <div>
                            <p className="font-bold text-[#0F4F42]">
                              شهر {formatArabicMonthKey(d.monthKey)}
                            </p>
                            <p className="text-[#102A24]/65">
                              بواسطة {d.recordedByName} · {formatArabicDateTime(d.recordedAt)}
                            </p>
                          </div>
                          <span className="font-extrabold tabular-nums text-[#167764]">
                            {formatEGP(d.amount)} ج.م
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-display text-sm font-bold text-[#0F4F42]">
                    ٢. المساعدات المالية والمشروعات النقدية ({historyData.financialAidTransactions.length})
                  </h4>
                  {historyData.financialAidTransactions.length === 0 ? (
                    <p className="mt-1.5 text-xs text-[#102A24]/60">لا توجد مساعدات نقدية استثنائية مسجلة.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-[#167764]/10 rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] px-3.5">
                      {historyData.financialAidTransactions.map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-2.5 text-xs">
                          <div>
                            <p className="font-bold text-[#0F4F42]">{t.title}</p>
                            <p className="text-[#102A24]/65">
                              {t.entryNumber} · {FINANCIAL_PURPOSE_LABELS_AR[t.purposeCategory]} ·{' '}
                              {t.txDate}
                            </p>
                          </div>
                          <span className="font-extrabold tabular-nums text-[#0F4F42]">
                            {formatEGP(t.amount)} ج.م
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-display text-sm font-bold text-[#0F4F42]">
                    ٣. المساعدات العينية من المخازن ({historyData.warehouseDistributions.length})
                  </h4>
                  {historyData.warehouseDistributions.length === 0 ? (
                    <p className="mt-1.5 text-xs text-[#102A24]/60">لا توجد مساعدات عينية منصرفة من المخزن.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-[#167764]/10 rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] px-3.5">
                      {historyData.warehouseDistributions.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-2.5 text-xs">
                          <div>
                            <p className="font-bold text-[#0F4F42]">{m.itemName}</p>
                            <p className="text-[#102A24]/65">
                              {m.movementDate} · {m.notes || 'تسليم عيني'}
                            </p>
                          </div>
                          <span className="font-extrabold tabular-nums text-[#32764C]">
                            الكمية: {formatInteger(m.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        titleAr="تأكيد حذف ملف الأسرة"
        messageAr={
          deleteTarget
            ? `هل أنت متأكد من حذف ملف الأسرة (${deleteTarget.fileNumber} — ${deleteTarget.headOfHousehold})؟ ملاحظة: يمنع النظام حذف أي أسرة لها سجل صرف مالي أو خطة معاش حفاظاً على التدقيق.`
            : ''
        }
        confirmLabelAr="تأكيد الحذف"
        tone="danger"
        loading={submitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
