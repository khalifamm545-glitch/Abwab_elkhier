import {
  CheckCircle2,
  Download,
  FileText,
  FolderKanban,
  Paperclip,
  Plus,
  Upload,
  Users,
} from 'lucide-react';
import {useCallback, useEffect, useState, type ChangeEvent, type FormEvent} from 'react';
import {api, ApiError, getPrivateFileUrl} from '../../lib/api';
import {formatEGP, formatInteger} from '../../lib/formatters';
import {
  PROJECT_CATEGORY_LABELS_AR,
  type CharityProjectCategory,
  type CharityProjectWithMetrics,
  type RolePermissionMatrix,
} from '../../types/auth';

interface ProjectsPanelProps {
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

const PROJECT_CATEGORIES = Object.keys(PROJECT_CATEGORY_LABELS_AR) as CharityProjectCategory[];

export function ProjectsPanel({permissions, onFeedback, onDataChanged}: ProjectsPanelProps) {
  const [projects, setProjects] = useState<CharityProjectWithMetrics[]>([]);
  const [families, setFamilies] = useState<
    Array<{id: string; fileNumber: string; headOfHousehold: string}>
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Add Project Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CharityProjectCategory>('food_aid');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('50000.00');
  const [status, setStatus] = useState<'active' | 'planned' | 'completed' | 'paused'>('active');

  // Edit progress / final report / beneficiaries inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompletion, setEditCompletion] = useState(0);
  const [editStatus, setEditStatus] = useState<'active' | 'planned' | 'completed' | 'paused'>(
    'active',
  );
  const [editFinalReport, setEditFinalReport] = useState('');
  const [editBeneficiaries, setEditBeneficiaries] = useState<string[]>([]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProjects();
      setProjects(res.projects);
      setFamilies(res.families);
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل بيانات المشروعات الخيرية.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createProject({name, category, description, budget, status});
      setName('');
      setDescription('');
      setBudget('50000.00');
      setShowAddForm(false);
      onFeedback({type: 'success', text: 'تم إنشاء المشروع الخيري بنجاح.'});
      await loadProjects();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر إنشاء المشروع الخيري.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (projectId: string) => {
    setSubmitting(true);
    try {
      await api.updateProject(projectId, {
        completionPercent: editCompletion,
        status: editStatus,
        finalReport: editFinalReport,
        beneficiaryFamilyIds: editBeneficiaries,
      });
      setEditingId(null);
      onFeedback({type: 'success', text: 'تم تحديث بيانات المشروع والتقرير النهائي بنجاح.'});
      await loadProjects();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحديث المشروع.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadAttachment = async (
    projectId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSubmitting(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
        reader.readAsDataURL(file);
      });
      await api.uploadProjectAttachment(projectId, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      });
      onFeedback({type: 'success', text: `تم رفع مرفق المشروع (${file.name}) بنجاح.`});
      await loadProjects();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر رفع مرفق المشروع.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleBeneficiary = (famId: string) => {
    setEditBeneficiaries((prev) =>
      prev.includes(famId) ? prev.filter((id) => id !== famId) : [...prev, famId],
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إدارة المساعدات والمشروعات الخيرية
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              متابعة الميزانية والتبرعات المخصصة والمصروفات الفعلية والمتبقي ونسبة الإنجاز والمستفيدين والمرفقات لكل مشروع.
            </p>
          </div>
          {permissions.canAddData && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer self-start"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{showAddForm ? 'إغلاق' : 'إنشاء مشروع خيري'}</span>
            </button>
          )}
        </div>

        {showAddForm && permissions.canAddData && (
          <form
            onSubmit={handleCreate}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 sm:p-5 space-y-4"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">اسم المشروع *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: مبادرة تجهيز العرائس أو شنطة رمضان"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">تصنيف المشروع *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CharityProjectCategory)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  {PROJECT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PROJECT_CATEGORY_LABELS_AR[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الميزانية التقديرية (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  dir="ltr"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-left text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">حالة المشروع</label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'active' | 'planned' | 'completed' | 'paused')
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  <option value="active">نشط وجارٍ تنفيذه</option>
                  <option value="planned">مخطط له</option>
                  <option value="paused">موقوف مؤقتاً</option>
                  <option value="completed">مكتمل</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#0F4F42]">وصف وأهداف المشروع *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف الفئة المستهدفة وخطة التنفيذ..."
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
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
                {submitting ? 'جارٍ الحفظ...' : 'حفظ المشروع'}
              </button>
            </div>
          </form>
        )}
      </section>

      {loading && projects.length === 0 ? (
        <div className="h-44 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : projects.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-[#167764]/45" aria-hidden="true" />
          <p className="mt-2 font-display text-base font-bold text-[#0F4F42]">
            لا توجد مشروعات خيرية مسجلة حتى الآن
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <article
                key={p.id}
                className="rounded-3xl border border-[#167764]/14 bg-white p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#167764] tabular-nums">
                      {p.code} · {PROJECT_CATEGORY_LABELS_AR[p.category]} ·{' '}
                      {p.status === 'active'
                        ? 'نشط'
                        : p.status === 'planned'
                          ? 'مخطط'
                          : p.status === 'completed'
                            ? 'مكتمل'
                            : 'موقوف مؤقتاً'}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-extrabold text-[#0F4F42]">
                      {p.name}
                    </h3>
                    <p className="mt-1 text-xs text-[#102A24]/75">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {permissions.canEditData && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditCompletion(p.completionPercent);
                          setEditStatus(p.status);
                          setEditFinalReport(p.finalReport || '');
                          setEditBeneficiaries(p.beneficiaryFamilyIds || []);
                        }}
                        className="min-h-[40px] rounded-xl border border-[#167764]/22 bg-[#F7FAF8] px-3.5 py-1.5 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                      >
                        تحديث الإنجاز والتقرير
                      </button>
                    )}
                    {permissions.canAddData && (
                      <label className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/22 bg-white px-3 py-1.5 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer">
                        <Upload className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                        <span>رفع صورة / مستند</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="sr-only"
                          onChange={(e) => handleUploadAttachment(p.id, e)}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Financial & Beneficiary Metrics */}
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#F7FAF8] p-4 sm:grid-cols-5">
                  <div>
                    <p className="text-[11px] text-[#102A24]/60">الميزانية</p>
                    <p className="mt-0.5 font-display text-sm font-extrabold tabular-nums text-[#0F4F42]">
                      {formatEGP(p.budget)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#102A24]/60">إجمالي التبرعات</p>
                    <p className="mt-0.5 font-display text-sm font-extrabold tabular-nums text-[#167764]">
                      {formatEGP(p.totalDonations)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#102A24]/60">إجمالي المصروفات</p>
                    <p className="mt-0.5 font-display text-sm font-extrabold tabular-nums text-[#32764C]">
                      {formatEGP(p.totalExpenses)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#102A24]/60">الرصيد المتبقي</p>
                    <p className="mt-0.5 font-display text-sm font-extrabold tabular-nums text-[#0F4F42]">
                      {formatEGP(p.remainingBalance)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#102A24]/60">الأسر المستفيدة</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 font-display text-sm font-extrabold tabular-nums text-[#0F4F42]">
                      <Users className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                      <span>{formatInteger(p.beneficiariesCount)} أسرة</span>
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#0F4F42]">نسبة إنجاز المشروع</span>
                    <span className="tabular-nums text-[#167764]">{p.completionPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF7F0]">
                    <div
                      className="h-full rounded-full bg-[#167764] transition-all duration-300"
                      style={{width: `${p.completionPercent}%`}}
                    />
                  </div>
                </div>

                {p.finalReport && !isEditing && (
                  <div className="rounded-2xl border border-[#167764]/12 bg-[#EEF7F0]/40 p-3.5 text-xs">
                    <p className="font-bold text-[#0F4F42] flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                      <span>التقرير النهائي للمشروع</span>
                    </p>
                    <p className="mt-1 leading-6 text-[#102A24]/85">{p.finalReport}</p>
                  </div>
                )}

                {p.attachments && p.attachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                    {p.attachments.map((doc) => (
                      <a
                        key={doc.id}
                        href={getPrivateFileUrl(doc.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#167764]/18 bg-[#F7FAF8] px-2.5 py-1 text-xs font-semibold text-[#0F4F42] hover:bg-[#EEF7F0]"
                      >
                        <Download className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                        <span className="max-w-[150px] truncate">{doc.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}

                {isEditing && (
                  <div className="rounded-2xl border border-[#167764]/20 bg-[#F7FAF8] p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-bold text-[#0F4F42]">
                          نسبة الإنجاز: {editCompletion}%
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={editCompletion}
                          onChange={(e) => setEditCompletion(Number(e.target.value))}
                          className="mt-2 w-full accent-[#167764]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#0F4F42]">حالة المشروع</label>
                        <select
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(
                              e.target.value as 'active' | 'planned' | 'completed' | 'paused',
                            )
                          }
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                        >
                          <option value="active">نشط</option>
                          <option value="planned">مخطط</option>
                          <option value="paused">موقوف مؤقتاً</option>
                          <option value="completed">مكتمل</option>
                        </select>
                      </div>
                    </div>

                    {families.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-[#0F4F42]">
                          ربط الأسر المستفيدة بالمشروع ({editBeneficiaries.length} مختارة)
                        </p>
                        <div className="mt-2 grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-[#167764]/15 bg-white p-2.5 sm:grid-cols-2">
                          {families.map((fam) => (
                            <label
                              key={fam.id}
                              className="inline-flex items-center gap-2 text-xs font-medium text-[#102A24] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={editBeneficiaries.includes(fam.id)}
                                onChange={() => toggleBeneficiary(fam.id)}
                                className="h-4 w-4 accent-[#167764]"
                              />
                              <span className="truncate">
                                {fam.fileNumber} — {fam.headOfHousehold}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-[#0F4F42]">
                        التقرير النهائي وملخص الأثر
                      </label>
                      <textarea
                        rows={3}
                        value={editFinalReport}
                        onChange={(e) => setEditFinalReport(e.target.value)}
                        placeholder="ملخص الإنجاز، عدد الحالات المستفيدة، والملاحظات الختامية..."
                        className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 py-2 text-sm"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-4 text-xs font-semibold cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleSaveEdit(p.id)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#167764] px-4 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>حفظ التحديثات</span>
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
