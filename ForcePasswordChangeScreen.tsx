import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {ROLE_META, type AuthSession} from '../types/auth';

const OFFICIAL_LOGO_SRC = '/assets/aistudio/file_0000000071846246a5e447d580e3e2b3_2_f9a3a92b.png';

interface ForcePasswordChangeScreenProps {
  session: AuthSession;
  onCompleted: () => void;
  onLoggedOut: () => void;
}

export function ForcePasswordChangeScreen({
  session,
  onCompleted,
  onLoggedOut,
}: ForcePasswordChangeScreenProps) {
  const {logout, refreshSession, updateSession} = useAuth();
  const {user} = session;
  const roleInfo = ROLE_META[user.role];

  const [logoError, setLogoError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 8) {
      setErrorMsg('يجب أن تتكون كلمة المرور الجديدة من ٨ أحرف على الأقل.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمتا المرور الجديدتان غير متطابقتين. يرجى التأكد من كتابتهما بشكل مطابق.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('يجب اختيار كلمة مرور جديدة تختلف تماماً عن كلمة المرور المؤقتة الحالية.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.changePassword({currentPassword, newPassword});
      if (res.session) {
        updateSession(res.session);
      } else {
        await refreshSession();
      }
      onCompleted();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور. يرجى التحقق من كلمة المرور المؤقتة.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onLoggedOut();
  };

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col bg-[#F7FAF8] text-[#102A24]">
      <header className="sticky top-0 z-30 border-b border-[#167764]/12 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#167764]/15 bg-[#FBF2E0] p-1">
              {!logoError ? (
                <img
                  src={OFFICIAL_LOGO_SRC}
                  alt="شعار مؤسسة أبواب الخير"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs font-bold text-[#167764]">أبواب</span>
              )}
            </div>
            <span className="font-display text-lg font-extrabold text-[#0F4F42] truncate">
              أبواب الخير
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
        <section className="w-full max-w-xl rounded-3xl border border-[#167764]/15 bg-white p-6 sm:p-8 lg:p-10 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D9A436]/35 bg-[#FDFBF5] text-[#9A6F18]">
              <KeyRound className="h-8 w-8" aria-hidden="true" />
            </div>

            <h1 className="mt-4 font-display text-2xl font-extrabold text-[#0F4F42] sm:text-3xl">
              تغيير كلمة المرور المؤقتة إلزامي
            </h1>
            <p className="mt-2 text-sm leading-7 text-[#102A24]/75">
              مرحباً <strong>{user.fullName}</strong> ({roleInfo.labelAr}) — حمايةً لحسابك الإداري،
              يتعين عليك تعيين كلمة مرور شخصية جديدة قبل الدخول إلى لوحة التحكم.
            </p>
          </div>

          <div className="rounded-2xl border border-[#167764]/18 bg-[#EEF7F0]/80 p-4 flex items-start gap-3 text-xs leading-6 text-[#0F4F42]">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
            <div>
              <p className="font-bold">ضابط أمان إجباري عند أول تسجيل دخول</p>
              <p className="mt-0.5 text-[#102A24]/80">
                يمنع النظام الوصول إلى أي قسم أو بيانات لحين استبدال كلمة المرور المؤقتة بكلمة مرور
                قوية (٨ أحرف على الأقل). تُشفَّر كلمة المرور فوراً على الخادم ولا تُسجَّل كنص واضح في
                أي سجل تدقيق.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="force-current-password"
                className="block text-sm font-semibold text-[#0F4F42]"
              >
                كلمة المرور المؤقتة الحالية
              </label>
              <div className="relative mt-1.5">
                <input
                  id="force-current-password"
                  type={showCurrent ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور المؤقتة التي استلمتها من رئيس مجلس الإدارة"
                  className="block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-3 pr-4 pl-14 text-base text-[#102A24] placeholder:text-[#102A24]/40 focus:border-[#167764] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((p) => !p)}
                  aria-label={showCurrent ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="force-new-password"
                className="block text-sm font-semibold text-[#0F4F42]"
              >
                كلمة المرور الشخصية الجديدة (٨ أحرف على الأقل)
              </label>
              <div className="relative mt-1.5">
                <input
                  id="force-new-password"
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="اختر كلمة مرور قوية جديدة"
                  className="block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-3 pr-4 pl-14 text-base text-[#102A24] placeholder:text-[#102A24]/40 focus:border-[#167764] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((p) => !p)}
                  aria-label={showNew ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                >
                  {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="force-confirm-password"
                className="block text-sm font-semibold text-[#0F4F42]"
              >
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="force-confirm-password"
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور الجديدة"
                className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] placeholder:text-[#102A24]/40 focus:border-[#167764] focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
            >
              <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                {submitting ? 'جارٍ حفظ كلمة المرور الجديدة...' : 'حفظ كلمة المرور والدخول إلى لوحة التحكم'}
              </span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
