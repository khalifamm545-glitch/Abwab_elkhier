import {
  Award,
  ClipboardList,
  Plus,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {api, ApiError} from '../../lib/api';
import {formatInteger} from '../../lib/formatters';
import {
  GRANULAR_PERM_LABELS_AR,
  ROLE_META,
  type ActivityTask,
  type AuthUser,
  type RolePermissionMatrix,
  type UserGranularPermissions,
  type VolunteerProfile,
} from '../../types/auth';

interface VolunteersPanelProps {
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

export function VolunteersPanel({
  permissions,
  onFeedback,
  onDataChanged,
}: VolunteersPanelProps) {
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Add Volunteer Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [teamName, setTeamName] = useState('فريق الخير الميداني');
  const [skillsText, setSkillsText] = useState('');

  // Assign task selection per volunteer
  const [assignTaskMap, setAssignTaskMap] = useState<Record<string, string>>({});

  const loadVolunteers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getVolunteers();
      setVolunteers(res.volunteers);
      setTasks(res.tasks);
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل بيانات المتطوعين.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadVolunteers();
  }, [loadVolunteers]);

  const handleAddVolunteer = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const skills = skillsText
        .split(/[،,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.createVolunteer({fullName, phone, address, teamName, skills});
      setFullName('');
      setPhone('');
      setAddress('');
      setSkillsText('');
      setShowAddForm(false);
      onFeedback({type: 'success', text: 'تم تسجيل المتطوع الجديد بنجاح.'});
      await loadVolunteers();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تسجيل المتطوع.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRateVolunteer = async (vol: VolunteerProfile, rating: number) => {
    setSubmitting(true);
    try {
      await api.updateVolunteer(vol.id, {rating});
      onFeedback({type: 'success', text: `تم تحديث تقييم المتطوع (${vol.fullName}) إلى ${rating}/5.`});
      await loadVolunteers();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر حفظ التقييم.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignTask = async (volId: string) => {
    const taskId = assignTaskMap[volId];
    if (!taskId) return;
    setSubmitting(true);
    try {
      await api.assignVolunteerToTask(volId, taskId);
      setAssignTaskMap((prev) => ({...prev, [volId]: ''}));
      onFeedback({type: 'success', text: 'تم تكليف المتطوع بالمهمة المحددة بنجاح.'});
      await loadVolunteers();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تكليف المتطوع بالمهمة.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إدارة المتطوعين وتوزيع المهام
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              سجل شامل للمتطوعين ومهاراتهم وفرقهم وتوزيع المهام الميدانية وتقييم المشاركة — بيانات
              المتطوعين إدارية وميدانية فقط ولا تُنشئ حسابات دخول إدارية للنظام.
            </p>
          </div>
          {permissions.canAddData && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer self-start"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{showAddForm ? 'إغلاق' : 'إضافة متطوع جديد'}</span>
            </button>
          )}
        </div>

        {showAddForm && permissions.canAddData && (
          <form
            onSubmit={handleAddVolunteer}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="الاسم الكامل للمتطوع *"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
              />
              <input
                type="tel"
                required
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="رقم الهاتف *"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3.5 text-left text-sm tabular-nums"
              />
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="الفريق التطوعي"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان / المنطقة"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
              />
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder="المهارات (مفصولة بفاصلة: بحث اجتماعي، توزيع، تنظيم)"
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm sm:col-span-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-4 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] rounded-xl bg-[#167764] px-5 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                حفظ المتطوع
              </button>
            </div>
          </form>
        )}
      </section>

      {loading && volunteers.length === 0 ? (
        <div className="h-40 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : volunteers.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-[#167764]/45" aria-hidden="true" />
          <p className="mt-2 font-display text-base font-bold text-[#0F4F42]">
            لا يوجد متطوعون مسجلون حالياً
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {volunteers.map((v) => (
            <article
              key={v.id}
              className="rounded-3xl border border-[#167764]/14 bg-white p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#167764]">
                    {v.teamName || 'فريق الخير'} · انضم في {v.joinedAt}
                  </p>
                  <h3 className="mt-0.5 font-display text-base font-extrabold text-[#0F4F42]">
                    {v.fullName}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#102A24]/65">
                    <span dir="ltr">{v.phone || 'بدون هاتف'}</span>
                    {v.address ? ` · ${v.address}` : ''}
                  </p>
                </div>
                <div className="text-left text-xs tabular-nums">
                  <p className="font-bold text-[#0F4F42]">
                    {formatInteger(v.assignedTasksCount)} مهمة ·{' '}
                    {formatInteger(v.participatedActivitiesCount)} نشاط
                  </p>
                  <p className="mt-0.5 text-[#32764C]">{v.isActive ? 'متطوع نشط' : 'غير نشط'}</p>
                </div>
              </div>

              {v.skills.length > 0 && (
                <p className="text-xs text-[#102A24]/75">
                  <strong className="text-[#0F4F42]">المهارات:</strong> {v.skills.join(' · ')}
                </p>
              )}

              {/* Participation Rating (1-5 Stars) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F7FAF8] px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F4F42]">
                  <Award className="h-4 w-4 text-[#D9A436]" aria-hidden="true" />
                  <span>تقييم المشاركة:</span>
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      disabled={!permissions.canEditData || submitting}
                      onClick={() => handleRateVolunteer(v, star)}
                      aria-label={`تقييم ${star} من 5`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white cursor-pointer disabled:cursor-default"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          star <= v.rating
                            ? 'fill-[#D9A436] text-[#D9A436]'
                            : 'text-[#102A24]/25'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Assign Task */}
              {permissions.canEditData && tasks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[#167764]/10 pt-3">
                  <select
                    value={assignTaskMap[v.id] || ''}
                    onChange={(e) =>
                      setAssignTaskMap((prev) => ({...prev, [v.id]: e.target.value}))
                    }
                    className="min-h-[40px] flex-1 min-w-[180px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs"
                  >
                    <option value="">— تكليف بمهمة ميدانية —</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.activityName})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignTaskMap[v.id] || submitting}
                    onClick={() => handleAssignTask(v.id)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#167764] px-3.5 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-45 cursor-pointer"
                  >
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>توزيع المهمة</span>
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// BOARD OF DIRECTORS REGISTRY PANEL (Module 10)
// =============================================================================

interface BoardRegistryPanelProps {
  currentUser: AuthUser;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
}

const MEMBERSHIP_LABELS: Record<'active' | 'inactive' | 'honorary', string> = {
  active: 'عضوية فعّالة',
  inactive: 'غير نشطة',
  honorary: 'عضوية شرفية',
};

export function BoardRegistryPanel({currentUser, onFeedback}: BoardRegistryPanelProps) {
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'honorary'>('active');
  const [editPhone, setEditPhone] = useState('');

  const canManageBoard = currentUser.role === 'president';

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getBoardRegistry();
      setMembers(res.members);
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل سجل مجلس الإدارة.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleSaveMember = async (memberId: string) => {
    setSubmitting(true);
    try {
      await api.updateBoardMember(memberId, {
        boardPosition: editPosition,
        membershipStatus: editStatus,
        phone: editPhone,
      });
      setEditingId(null);
      onFeedback({type: 'success', text: 'تم تحديث بيانات عضو مجلس الإدارة بنجاح.'});
      await loadBoard();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحديث بيانات العضوية.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-[#167764]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              سجل أعضاء مجلس الإدارة والحوكمة
            </h2>
            <p className="mt-0.5 text-xs text-[#102A24]/65">
              تشكيل مجلس إدارة جمعية أبواب الخير والمناصب والصلاحيات المعتمدة لكل عضو.
            </p>
          </div>
        </div>
      </section>

      {loading && members.length === 0 ? (
        <div className="h-40 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : members.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <p className="font-display text-base font-bold text-[#0F4F42]">
            لم يتم إضافة أعضاء لمجلس الإدارة بعد
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65">
            يمكن لرئيس مجلس الإدارة إدارة حسابات القيادة والمديرين من قسم «إدارة المديرين والصلاحيات».
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {members.map((m) => {
            const isEditing = editingId === m.id;
            const enabledPerms = (
              Object.keys(GRANULAR_PERM_LABELS_AR) as Array<keyof UserGranularPermissions>
            ).filter((k) => m.granularPermissions?.[k]);

            return (
              <article
                key={m.id}
                className="rounded-3xl border border-[#167764]/14 bg-white p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#167764]">
                      {m.boardPosition || ROLE_META[m.role].labelAr} ·{' '}
                      {MEMBERSHIP_LABELS[m.membershipStatus || 'active']}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-extrabold text-[#0F4F42]">
                      {m.fullName}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#102A24]/70">
                      <span dir="ltr">{m.email}</span>
                      {m.phone ? (
                        <>
                          {' '}
                          · <span dir="ltr">{m.phone}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#102A24]/55">
                      تاريخ الانضمام: {m.createdAt.slice(0, 10)}
                    </p>
                  </div>

                  {canManageBoard && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditPosition(m.boardPosition || ROLE_META[m.role].labelAr);
                        setEditStatus(m.membershipStatus || 'active');
                        setEditPhone(m.phone || '');
                      }}
                      className="min-h-[40px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      تعديل المنصب
                    </button>
                  )}
                </div>

                <div className="rounded-2xl bg-[#F7FAF8] p-3 text-xs">
                  <p className="font-bold text-[#0F4F42] flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
                    <span>الصلاحيات التفصيلية المعتمدة:</span>
                  </p>
                  <p className="mt-1 leading-6 text-[#102A24]/75">
                    {enabledPerms.length > 0
                      ? enabledPerms.map((k) => GRANULAR_PERM_LABELS_AR[k]).join(' · ')
                      : 'لا توجد صلاحيات مفعلة حالياً'}
                  </p>
                </div>

                {isEditing && (
                  <div className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-3.5 space-y-3">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <input
                        type="text"
                        value={editPosition}
                        onChange={(e) => setEditPosition(e.target.value)}
                        placeholder="المنصب بالمجلس"
                        className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-3 text-xs"
                      />
                      <select
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as 'active' | 'inactive' | 'honorary')
                        }
                        className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-3 text-xs"
                      >
                        <option value="active">عضوية فعّالة</option>
                        <option value="honorary">عضوية شرفية</option>
                        <option value="inactive">غير نشطة</option>
                      </select>
                      <input
                        type="tel"
                        dir="ltr"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="رقم التواصل"
                        className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-3 text-left text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[38px] rounded-xl border border-[#167764]/20 bg-white px-3 text-xs font-semibold cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleSaveMember(m.id)}
                        className="min-h-[38px] rounded-xl bg-[#167764] px-4 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
                      >
                        حفظ
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
