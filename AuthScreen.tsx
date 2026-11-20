import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';

const OFFICIAL_LOGO_SRC = '/assets/aistudio/file_0000000071846246a5e447d580e3e2b3_2_f9a3a92b.png';

type AuthMode = 'login' | 'forgot' | 'bootstrap';

interface AuthScreenProps {
  onBackHome: () => void;
  onSuccess: () => void;
}

export function AuthScreen({onBackHome, onSuccess}: AuthScreenProps) {
  const {hasPresident, login, bootstrapPresident} = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [logoError, setLogoError] = useState(false);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot / Reset state
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // One-time President Bootstrap state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmRegPassword, setConfirmRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotRequest = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const res = await api.forgotPassword(forgotIdentifier);
      setInfoMsg(res.message);
      setForgotStep('verify');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إرسال طلب استعادة كلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetComplete = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const res = await api.resetPassword({
        identifier: forgotIdentifier,
        code: resetCode,
        newPassword,
      });
      setInfoMsg(res.message);
      setResetCode('');
      setNewPassword('');
      setIdentifier(forgotIdentifier);
      setForgotStep('request');
      setMode('login');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapPresident = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    if (regPassword !== confirmRegPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين. يرجى التأكد من كتابة نفس كلمة المرور في الحقلين.');
      return;
    }
    setSubmitting(true);
    try {
      await bootstrapPresident({
        fullName,
        username,
        email,
        phone,
        password: regPassword,
      });
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تأسيس حساب رئيس مجلس الإدارة.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col bg-[#F7FAF8] text-[#102A24]">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#167764]/12 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#0F4F42] transition-colors hover:bg-[#EEF7F0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>العودة إلى الصفحة الرئيسية</span>
          </button>

          <span className="font-display text-lg font-extrabold text-[#0F4F42] whitespace-nowrap shrink-0">
            أبواب الخير
          </span>
        </div>
      </header>

      {/* Main Responsive Auth Container */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          {/* Desktop / Tablet Institutional Brand Panel */}
          <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-3xl border border-[#167764]/12 bg-[#EEF7F0] p-8">
            <div>
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-[#167764]/15 bg-[#FBF2E0] p-2">
                {!logoError ? (
                  <img
                    src={OFFICIAL_LOGO_SRC}
                    alt="شعار مؤسسة أبواب الخير"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-lg font-extrabold text-[#167764]">أبواب الخير</span>
                )}
              </div>

              <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight text-[#0F4F42]">
                بوابة الدخول الإداري لمؤسسة أبواب الخير
              </h1>
              <p className="mt-3 text-sm leading-7 text-[#102A24]/80">
                أبواب الخير ... طريقك للخير 💚 — نظام حوكمة وصلاحيات مؤسسي مخصص لحساب رئيس مجلس
                الإدارة وحسابات المديرين المعتمدين فقط.
              </p>
            </div>

            <div className="mt-8 border-t border-[#167764]/15 pt-6 space-y-3 text-xs leading-6 text-[#102A24]/75">
              <p className="font-semibold text-[#0F4F42]">ضوابط الحماية والصلاحيات:</p>
              <p>• التحقق من الهوية وكلمات المرور المشفّرة وتطبيق الصلاحيات فعلياً على الخادم.</p>
              <p>• إجبار المدير على تغيير كلمة المرور المؤقتة عند أول تسجيل دخول.</p>
              <p>• التسجيل العام غير متاح؛ تُنشأ حسابات المديرين وتُحدد صلاحياتهم حصرياً عبر رئيس مجلس الإدارة.</p>
            </div>
          </aside>

          {/* Primary Auth Card (Mobile-First) */}
          <section className="lg:col-span-7 rounded-3xl border border-[#167764]/12 bg-white p-6 sm:p-8 lg:p-10">
            {/* Official Emblem & Heading */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[#167764]/15 bg-[#FBF2E0] p-1.5 sm:h-24 sm:w-24">
                {!logoError ? (
                  <img
                    src={OFFICIAL_LOGO_SRC}
                    alt="شعار أبواب الخير"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-base font-extrabold text-[#167764]">أبواب الخير</span>
                )}
              </div>

              <h2 className="mt-4 font-display text-2xl font-extrabold text-[#0F4F42] sm:text-3xl">
                {mode === 'login' && 'تسجيل الدخول الإداري'}
                {mode === 'forgot' && 'استعادة كلمة المرور'}
                {mode === 'bootstrap' && 'تأسيس حساب رئيس مجلس الإدارة'}
              </h2>
              <p className="mt-1.5 text-sm text-[#102A24]/70">
                {mode === 'login' && 'أدخل بيانات حسابك الإداري للانتقال إلى لوحة تحكم جمعية أبواب الخير'}
                {mode === 'forgot' && 'أدخل بريدك الإلكتروني أو اسم المستخدم لبدء استعادة كلمة المرور'}
                {mode === 'bootstrap' && 'إجراء تأسيسي آمن لمرة واحدة فقط لإنشاء حساب رئيس مجلس الإدارة الأساسي'}
              </p>
            </div>

            {/* One-Time President Setup Notice (Only when zero president account exists yet) */}
            {!hasPresident && mode === 'login' && (
              <div className="mt-6 rounded-2xl border border-[#167764]/20 bg-[#EEF7F0] p-4 text-right">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#0F4F42]">
                      لم يتم تأسيس حساب رئيس مجلس الإدارة بعد
                    </p>
                    <p className="mt-1 text-xs leading-6 text-[#102A24]/80">
                      لأن النظام جديد، يمكنك الآن تنفيذ التأسيس الأولي الآمن لمرة واحدة فقط
                      لإنشاء حساب رئيس مجلس الإدارة الأساسي. بعد التأسيس سيُغلق هذا الخيار نهائياً
                      ولن يُسمح بإعادة تأسيسه.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('bootstrap')}
                      className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F4F42] cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>تأسيس حساب رئيس مجلس الإدارة لأول مرة</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback Messages */}
            {errorMsg && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="mt-5 flex items-start gap-3 rounded-2xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-3 text-sm text-[#0F4F42]"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
                <span>{infoMsg}</span>
              </div>
            )}

            {/* 1. LOGIN FORM */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="mt-6 space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-sm font-semibold text-[#0F4F42]"
                  >
                    البريد الإلكتروني أو اسم المستخدم
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="مثال: name@example.com أو username"
                    className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] placeholder:text-[#102A24]/40 focus:border-[#167764] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-semibold text-[#0F4F42]"
                    >
                      كلمة المرور
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotIdentifier(identifier);
                        setForgotStep('request');
                        switchMode('forgot');
                      }}
                      className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[#167764] hover:text-[#0F4F42] hover:underline cursor-pointer"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>

                  <div className="relative mt-1">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-3 pr-4 pl-14 text-base text-[#102A24] placeholder:text-[#102A24]/40 focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] transition-colors hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Eye className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                >
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{submitting ? 'جارٍ التحقق من البيانات...' : 'تسجيل الدخول'}</span>
                </button>

                <div className="border-t border-[#167764]/12 pt-5">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#167764]/15 bg-[#EEF7F0]/80 px-4 py-3.5 text-right">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
                    <div className="text-xs leading-6 text-[#102A24]/80">
                      <p className="font-bold text-[#0F4F42]">
                        بوابة الدخول مخصصة لإدارة جمعية أبواب الخير فقط
                      </p>
                      <p className="mt-0.5">
                        يقتصر الدخول على رئيس مجلس الإدارة والمديرين المعتمدين فقط. لا يتوفر
                        تسجيل ذاتي؛ لإنشاء حساب مدير أو تعديل الصلاحيات يرجى التواصل مع رئيس مجلس الإدارة.
                      </p>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* 2. FORGOT PASSWORD & RECOVERY CODE FORM */}
            {mode === 'forgot' && (
              <div className="mt-6 space-y-5">
                {forgotStep === 'request' ? (
                  <form onSubmit={handleForgotRequest} className="space-y-5">
                    <div>
                      <label
                        htmlFor="forgot-identifier"
                        className="block text-sm font-semibold text-[#0F4F42]"
                      >
                        البريد الإلكتروني أو اسم المستخدم
                      </label>
                      <input
                        id="forgot-identifier"
                        type="text"
                        required
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="أدخل بريدك الإلكتروني أو اسم المستخدم"
                        className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                    >
                      <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{submitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب استعادة كلمة المرور'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForgotStep('verify')}
                      className="min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-sm font-semibold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      لديّ رمز تحقق مسبقاً (٦ أرقام)
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetComplete} className="space-y-4">
                    <div>
                      <label
                        htmlFor="reset-identifier"
                        className="block text-sm font-semibold text-[#0F4F42]"
                      >
                        البريد الإلكتروني أو اسم المستخدم
                      </label>
                      <input
                        id="reset-identifier"
                        type="text"
                        required
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reset-code"
                        className="block text-sm font-semibold text-[#0F4F42]"
                      >
                        رمز الاستعادة (٦ أرقام من رئيس مجلس الإدارة)
                      </label>
                      <input
                        id="reset-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-center text-lg font-bold tracking-[0.35em] tabular-nums text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reset-new-password"
                        className="block text-sm font-semibold text-[#0F4F42]"
                      >
                        كلمة المرور الجديدة (٨ أحرف على الأقل)
                      </label>
                      <div className="relative mt-2">
                        <input
                          id="reset-new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="أدخل كلمة مرور قوية جديدة"
                          className="block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-3 pr-4 pl-14 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((p) => !p)}
                          aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                    >
                      <span>{submitting ? 'جارٍ التحديث...' : 'حفظ كلمة المرور الجديدة'}</span>
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="min-h-[44px] w-full text-center text-sm font-semibold text-[#167764] hover:underline cursor-pointer"
                >
                  العودة إلى شاشة تسجيل الدخول
                </button>
              </div>
            )}

            {/* 3. ONE-TIME PRESIDENT BOOTSTRAP (ONLY WHEN NO PRESIDENT EXISTS) */}
            {mode === 'bootstrap' && !hasPresident && (
              <form onSubmit={handleBootstrapPresident} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[#167764]/20 bg-[#EEF7F0] px-4 py-3 text-xs leading-6 text-[#0F4F42]">
                  يُنشأ عبر هذه الشاشة حساب <strong>«رئيس مجلس الإدارة»</strong> الأساسي والوحيد
                  للجمعية لمرة واحدة فقط. بعد إتمام التأسيس تُغلق هذه الشاشة نهائياً، ويدير الرئيس
                  إنشاء حسابات المديرين وصلاحياتهم من داخل لوحة التحكم.
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-fullname" className="block text-sm font-semibold text-[#0F4F42]">
                      الاسم الكامل
                    </label>
                    <input
                      id="reg-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="الاسم الثلاثي"
                      className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-username" className="block text-sm font-semibold text-[#0F4F42]">
                      اسم المستخدم (إنجليزي)
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      required
                      dir="ltr"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ahmed.ali"
                      className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-left text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-semibold text-[#0F4F42]">
                      البريد الإلكتروني
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-left text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-phone" className="block text-sm font-semibold text-[#0F4F42]">
                      رقم الهاتف (اختياري)
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01000000000"
                      className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-left text-base tabular-nums text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-password" className="block text-sm font-semibold text-[#0F4F42]">
                      كلمة المرور (٨ أحرف على الأقل)
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="reg-password"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="أدخل كلمة مرور قوية"
                        className="block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-3 pr-4 pl-14 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((p) => !p)}
                        aria-label={showRegPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                      >
                        {showRegPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm-password"
                      className="block text-sm font-semibold text-[#0F4F42]"
                    >
                      تأكيد كلمة المرور
                    </label>
                    <input
                      id="reg-confirm-password"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmRegPassword}
                      onChange={(e) => setConfirmRegPassword(e.target.value)}
                      placeholder="أعد كتابة كلمة المرور"
                      className="mt-1.5 block min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-4 py-3 text-base text-[#102A24] focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <p className="text-[11px] leading-5 text-[#102A24]/65">
                  تُشفَّر كلمة المرور فوراً على الخادم بخوارزمية أحادية الاتجاه ولا تُخزَّن كنص واضح ولا تظهر مطلقاً في سجلات التدقيق أو النظام.
                </p>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                >
                  <span>
                    {submitting
                      ? 'جارٍ تأسيس الحساب...'
                      : 'تأكيد وتأسيس حساب رئيس مجلس الإدارة'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="min-h-[44px] w-full text-center text-sm font-semibold text-[#167764] hover:underline cursor-pointer"
                >
                  لديك حساب بالفعل؟ العودة لتسجيل الدخول
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
