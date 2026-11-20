import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  DatabaseBackup,
  Info,
  RotateCcw,
  Save,
  Settings,
  Upload,
} from 'lucide-react';
import {useCallback, useEffect, useState, type ChangeEvent, type FormEvent} from 'react';
import {api, ApiError} from '../../lib/api';
import {downloadJsonFile, OFFICIAL_LOGO_PATH} from '../../lib/exportUtils';
import {formatArabicDateTime} from '../../lib/formatters';
import type {AppNotification, OrganizationSettings} from '../../types/auth';

// =============================================================================
// 1. NOTIFICATIONS CENTER (Module 12)
// =============================================================================

interface NotificationsPanelProps {
  notifications: AppNotification[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function NotificationsPanel({
  notifications,
  loading,
  onRefresh,
  onNavigate,
}: NotificationsPanelProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
            مركز الإشعارات والتنبيهات الفورية
          </h2>
          <p className="mt-1 text-xs text-[#102A24]/65">
            تنبيهات حية لمعاشات الخير المستحقة، طلبات الأسر الجديدة، القيود بانتظار الاعتماد أو الصرف، انخفاض المخزون، والمهام المتأخرة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer self-start"
        >
          تحديث التنبيهات
        </button>
      </section>

      {loading && notifications.length === 0 ? (
        <div className="h-40 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : notifications.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-[#167764]/45" aria-hidden="true" />
          <p className="mt-2 font-display text-base font-bold text-[#0F4F42]">
            لا توجد تنبيهات عاجلة أو معلّقة حالياً
          </p>
          <p className="mt-1 text-xs text-[#102A24]/65">
            جميع الإجراءات والمعاشات والمهام ضمن نطاق صلاحيتك منتظمة.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <article
              key={n.id}
              className={`rounded-3xl border bg-white p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                n.severity === 'urgent'
                  ? 'border-amber-400/70 bg-amber-50/35'
                  : n.severity === 'warning'
                    ? 'border-[#D9A436]/45'
                    : 'border-[#167764]/14'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    n.severity === 'urgent'
                      ? 'bg-amber-100 text-amber-800'
                      : n.severity === 'warning'
                        ? 'bg-[#FDF6E4] text-[#9A6F18]'
                        : 'bg-[#EEF7F0] text-[#167764]'
                  }`}
                >
                  {n.severity === 'info' ? (
                    <Info className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h3 className="font-display text-sm font-extrabold text-[#0F4F42]">{n.titleAr}</h3>
                  <p className="mt-1 text-xs leading-6 text-[#102A24]/80">{n.messageAr}</p>
                  <p className="mt-1 text-[11px] text-[#102A24]/55">
                    {formatArabicDateTime(n.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(n.targetTab)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>الانتقال للقسم</span>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 2. ORGANIZATION SETTINGS & BACKUP PANEL (Module 13)
// =============================================================================

interface SettingsPanelProps {
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onSettingsUpdated?: (settings: OrganizationSettings) => void;
}

export function SettingsPanel({onFeedback, onSettingsUpdated}: SettingsPanelProps) {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Editable fields
  const [nameAr, setNameAr] = useState('أبواب الخير');
  const [sloganAr, setSloganAr] = useState('');
  const [secondarySloganAr, setSecondarySloganAr] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [receiptPrefix, setReceiptPrefix] = useState('DON');
  const [receiptFooterAr, setReceiptFooterAr] = useState('');
  const [authorizedSignerName, setAuthorizedSignerName] = useState('');
  const [donationTypesText, setDonationTypesText] = useState('');
  const [expenseTypesText, setExpenseTypesText] = useState('');
  const [aidTypesText, setAidTypesText] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      const s = res.settings;
      setSettings(s);
      setNameAr(s.nameAr);
      setSloganAr(s.sloganAr);
      setSecondarySloganAr(s.secondarySloganAr);
      setRegistrationNumber(s.registrationNumber);
      setPhone(s.phone);
      setEmail(s.email);
      setAddress(s.address);
      setReceiptPrefix(s.receiptPrefix);
      setReceiptFooterAr(s.receiptFooterAr);
      setAuthorizedSignerName(s.authorizedSignerName);
      setDonationTypesText((s.customDonationTypes || []).join('، '));
      setExpenseTypesText((s.customExpenseTypes || []).join('، '));
      setAidTypesText((s.customAidTypes || []).join('، '));
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل إعدادات الجمعية.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const splitArabicList = (txt: string) =>
    txt
      .split(/[،,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateSettings({
        nameAr,
        sloganAr,
        secondarySloganAr,
        registrationNumber,
        phone,
        email,
        address,
        receiptPrefix,
        receiptFooterAr,
        authorizedSignerName,
        customDonationTypes: splitArabicList(donationTypesText),
        customExpenseTypes: splitArabicList(expenseTypesText),
        customAidTypes: splitArabicList(aidTypesText),
      });
      setSettings(res.settings);
      onSettingsUpdated?.(res.settings);
      onFeedback({type: 'success', text: 'تم حفظ إعدادات الجمعية وتنسيق الإيصالات بنجاح.'});
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة صورة الشعار.'));
        reader.readAsDataURL(file);
      });
      const res = await api.updateSettings({
        logoUpload: {
          fileName: file.name,
          mimeType: file.type || 'image/png',
          base64Data,
        },
      });
      setSettings(res.settings);
      onSettingsUpdated?.(res.settings);
      onFeedback({type: 'success', text: 'تم تحديث شعار الإيصالات والتقارير بنجاح.'});
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر رفع الشعار.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetLogo = async () => {
    setSaving(true);
    try {
      const res = await api.updateSettings({resetLogoToDefault: true});
      setSettings(res.settings);
      onSettingsUpdated?.(res.settings);
      onFeedback({type: 'success', text: 'تمت استعادة الشعار الرسمي الافتراضي لجمعية أبواب الخير.'});
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر استعادة الشعار.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const backupData = await api.downloadBackupJson();
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJsonFile(backupData, `abwab-alkhair-backup-${dateStr}.json`);
      onFeedback({
        type: 'success',
        text: 'تم استخراج وتحميل النسخة الاحتياطية الكاملة لقاعدة البيانات وتوثيقها في سجل المراجعة.',
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر استخراج النسخة الاحتياطية.',
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoring(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const res = await api.restoreBackupJson(parsed);
      await loadSettings();
      onFeedback({
        type: 'success',
        text: `تمت استعادة النسخة الاحتياطية بنجاح (الأسر: ${res.restoredCounts.families ?? 0} · التبرعات: ${res.restoredCounts.donations ?? 0} · الخزائن: ${res.restoredCounts.treasuryAccounts ?? 0}) مع حفظ نسخة أمان تلقائية قبل الاستعادة.`,
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'تعذر استعادة الملف. تأكد من اختيار ملف نسخة احتياطية JSON صادر من تطبيق أبواب الخير.',
      });
    } finally {
      setRestoring(false);
    }
  };

  if (loading && !settings) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />;
  }

  return (
    <div className="space-y-6">
      {/* Header & Database Backup */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF7F0] text-[#167764]">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إعدادات جمعية أبواب الخير والنسخ الاحتياطي
            </h2>
            <p className="mt-0.5 text-xs text-[#102A24]/65">
              إدارة بيانات الجمعية والشعار الرسمي وتنسيق الإيصالات وتصنيفات العمل الخيري والنسخ الاحتياطي.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            disabled={backingUp}
            onClick={handleBackup}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F4F42] px-4 py-2 text-xs font-bold text-white hover:bg-[#167764] disabled:opacity-50 cursor-pointer"
          >
            <DatabaseBackup className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{backingUp ? 'جارٍ التجهيز...' : 'تحميل نسخة احتياطية (JSON)'}</span>
          </button>
          <label
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#167764]/25 bg-[#F7FAF8] px-4 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer ${
              restoring ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <Upload className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
            <span>{restoring ? 'جارٍ الاستعادة...' : 'استعادة نسخة احتياطية'}</span>
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleRestoreFile}
            />
          </label>
        </div>
      </section>

      {/* Main Settings Form */}
      <form
        onSubmit={handleSave}
        className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-6"
      >
        {/* Logo Preview & Upload */}
        <div className="flex flex-col gap-4 rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src={settings?.customLogoUrl || OFFICIAL_LOGO_PATH}
              alt="شعار أبواب الخير"
              className="h-16 w-16 rounded-2xl border border-[#167764]/15 bg-white object-contain p-1.5"
            />
            <div>
              <p className="font-display text-sm font-extrabold text-[#0F4F42]">
                الشعار الرسمي للتقارير والإيصالات
              </p>
              <p className="mt-0.5 text-xs text-[#102A24]/65">
                الشعار الرسمي لجمعية أبواب الخير محفوظ ومحمّي ولا يتغير إلا بقرار رئيس مجلس الإدارة فقط.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer">
              <Upload className="h-3.5 w-3.5 text-[#167764]" aria-hidden="true" />
              <span>تحديث الشعار</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleUploadLogo}
              />
            </label>
            {settings?.customLogoUrl && (
              <button
                type="button"
                onClick={handleResetLogo}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#102A24] hover:bg-[#EEF7F0] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>استعادة الرسمي</span>
              </button>
            )}
          </div>
        </div>

        {/* Organization Details */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">اسم الجمعية الرسمي</label>
            <input
              type="text"
              required
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">رقم الإشهار الرسمي</label>
            <input
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="مثال: رقم إشهار وزارة التضامن الاجتماعي"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">الشعار النصي الأساسي</label>
            <input
              type="text"
              value={sloganAr}
              onChange={(e) => setSloganAr(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">الشعار النصي الثانوي</label>
            <input
              type="text"
              value={secondarySloganAr}
              onChange={(e) => setSecondarySloganAr(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">هاتف الجمعية</label>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-left text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0F4F42]">البريد الإلكتروني الرسمي</label>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-left text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-[#0F4F42]">عنوان المقر الرسمي</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
            />
          </div>
        </div>

        {/* Receipt Formatting */}
        <div className="border-t border-[#167764]/10 pt-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#0F4F42]">
            إعدادات الإيصالات الرسمية والعملة (جنيه مصري — EGP)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">بادئة ترقيم الإيصالات</label>
              <input
                type="text"
                dir="ltr"
                maxLength={8}
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-left text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">الموقّع المعتمد بالإيصال</label>
              <input
                type="text"
                value={authorizedSignerName}
                onChange={(e) => setAuthorizedSignerName(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">تذييل الإيصال الرسمي</label>
              <input
                type="text"
                value={receiptFooterAr}
                onChange={(e) => setReceiptFooterAr(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Customizable Charity Categories */}
        <div className="border-t border-[#167764]/10 pt-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#0F4F42]">
            تصنيفات التبرعات والمصروفات والمساعدات (مفصولة بفاصلة)
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">أنواع التبرعات</label>
              <textarea
                rows={2}
                value={donationTypesText}
                onChange={(e) => setDonationTypesText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">أنواع المصروفات</label>
              <textarea
                rows={2}
                value={expenseTypesText}
                onChange={(e) => setExpenseTypesText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">أنواع المساعدات</label>
              <textarea
                rows={2}
                value={aidTypesText}
                onChange={(e) => setAidTypesText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#167764] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <span>جارٍ الحفظ...</span>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                <span>حفظ إعدادات الجمعية</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
