import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  PlusSquare,
  Share,
  Share2,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {OFFICIAL_LOGO_PATH} from '../lib/exportUtils';
import {OfflineBanner} from './PWAInstallButton';

interface InstallAppPageProps {
  embedded?: boolean;
  isAuthenticated?: boolean;
  onOpenApp?: () => void;
  onOpenLogin?: () => void;
  onBackHome?: () => void;
}

export function InstallAppPage({
  embedded = false,
  isAuthenticated = false,
  onOpenApp,
  onOpenLogin,
  onBackHome,
}: InstallAppPageProps) {
  const {isInstallable, isInstalled, isIOS, isAndroid, install} = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const installUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/install';
    return `${window.location.origin}/install`;
  }, []);

  const appLaunchUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return `${window.location.origin}/`;
  }, []);

  const handleInstallClick = async () => {
    setInstalling(true);
    setInstallFeedback(null);
    try {
      const accepted = await install();
      if (accepted) {
        setInstallFeedback('تم بدء تثبيت تطبيق أبواب الخير بنجاح؛ ستظهر أيقونته الرسمية على شاشتك الرئيسية.');
      } else {
        setInstallFeedback('تم إلغاء نافذة التثبيت. يمكنك إعادة المحاولة في أي وقت من هذا الزر أو من قائمة المتصفح.');
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setInstallFeedback(`انسخ الرابط التالي لمشاركته: ${installUrl}`);
    }
  };

  const handleShareLink = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'تثبيت تطبيق أبواب الخير',
          text: 'حمّل وثبّت التطبيق الرسمي لمؤسسة أبواب الخير على هاتفك مباشرة',
          url: installUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyLink();
  };

  const content = (
    <div className="space-y-6">
      {/* Hero Card with Official Logo & Direct Actions */}
      <section className="rounded-3xl border border-[#167764]/14 bg-white p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-[#167764]/18 bg-[#FBF2E0] p-2 shadow-xs sm:h-32 sm:w-32">
            <img
              src={OFFICIAL_LOGO_PATH}
              alt="الشعار الرسمي لمؤسسة أبواب الخير"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>

          <h1 className="mt-5 font-display text-2xl font-extrabold text-[#0F4F42] sm:text-3xl">
            تثبيت تطبيق أبواب الخير
          </h1>
          <p className="mt-1.5 font-display text-sm font-bold text-[#167764]">
            أبواب الخير ... طريقك للخير 💚
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#102A24]/80 sm:text-base">
            التطبيق الرسمي لمؤسسة <strong className="text-[#0F4F42]">أبواب الخير</strong> لإدارة
            الأسر المستفيدة ومعاشات الخير والتبرعات والحوكمة المالية. يمكنك تثبيته مباشرة على
            الشاشة الرئيسية لهاتفك (Android أو iPhone) للوصول السريع بواجهة مستقلة وآمنة.
          </p>

          {/* Status Banner if Already Installed */}
          {isInstalled && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-2.5 text-sm font-bold text-[#0F4F42]">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#167764]" aria-hidden="true" />
              <span>التطبيق مثبّت بالفعل ويعمل حالياً بواجهة التطبيق المستقل</span>
            </div>
          )}

          {/* Live Feedback */}
          {installFeedback && (
            <div
              role="status"
              className="mt-4 max-w-xl rounded-2xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-3 text-xs font-semibold leading-6 text-[#0F4F42] sm:text-sm"
            >
              {installFeedback}
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleInstallClick()}
                className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
              >
                <Download className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>
                  {installing
                    ? 'جارٍ فتح نافذة التثبيت...'
                    : 'تثبيت تطبيق أبواب الخير الآن (Android / المتصفح)'}
                </span>
              </button>
            )}

            {!embedded && (
              <button
                type="button"
                onClick={isAuthenticated ? onOpenApp : onOpenLogin || onOpenApp}
                className={`inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-colors cursor-pointer ${
                  !isInstalled && isInstallable
                    ? 'border border-[#167764]/25 bg-[#EEF7F0] text-[#0F4F42] hover:bg-[#dff0e3]'
                    : 'bg-[#167764] text-white hover:bg-[#0F4F42]'
                }`}
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {isAuthenticated ? 'فتح لوحة التحكم' : 'فتح وتشغيل تطبيق أبواب الخير'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#167764]/20 bg-white px-4 py-3 text-sm font-semibold text-[#0F4F42] transition-colors hover:bg-[#F7FAF8] cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
                  <span>تم نسخ رابط التثبيت</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
                  <span>نسخ رابط التثبيت</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleShareLink()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#D9A436]/40 bg-[#FDF6E4] px-4 py-3 text-sm font-semibold text-[#8A6112] transition-colors hover:bg-[#faecc7] cursor-pointer"
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>مشاركة الرابط</span>
            </button>
          </div>
        </div>
      </section>

      {/* Platform Guides Grid: Android & iPhone */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Android Chrome Guide */}
        <section
          className={`rounded-3xl border bg-white p-6 space-y-4 ${
            isAndroid ? 'border-[#167764] ring-1 ring-[#167764]/20' : 'border-[#167764]/14'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF7F0] text-[#167764]">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#0F4F42]">
                  تثبيت التطبيق على هواتف Android
                </h2>
                <p className="text-xs text-[#102A24]/65">عبر متصفح Google Chrome</p>
              </div>
            </div>
            {isAndroid && (
              <span className="rounded-lg bg-[#EEF7F0] px-2.5 py-1 text-[11px] font-bold text-[#167764]">
                جهازك الحالي
              </span>
            )}
          </div>

          {!isInstalled && isInstallable ? (
            <div className="rounded-2xl border border-[#167764]/20 bg-[#EEF7F0]/75 p-4 space-y-3">
              <p className="text-xs font-semibold leading-6 text-[#0F4F42]">
                متصفحك يدعم التثبيت المباشر الآن — اضغط على الزر التالي لتثبيت «أبواب الخير» فوراً:
              </p>
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleInstallClick()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>تثبيت التطبيق على Android</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-3.5 text-xs leading-6 text-[#102A24]/80">
              {isInstalled
                ? 'التطبيق مثبّت بالفعل على جهازك ويعمل بأيقونة أبواب الخير الرسمية.'
                : 'إذا لم يظهر زر التثبيت التلقائي في متصفحك الحالي، افتح الرابط في Google Chrome واتبع الخطوات البسيطة أدناه:'}
            </div>
          )}

          <ol className="space-y-3 text-sm leading-7 text-[#102A24]/85">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#EEF7F0] text-xs font-extrabold text-[#167764]">
                ١
              </span>
              <span>
                افتح رابط التطبيق في متصفح <strong>Google Chrome</strong> (وليس متصفح واتساب أو
                فيسبوك الداخلي).
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#EEF7F0] text-xs font-extrabold text-[#167764]">
                ٢
              </span>
              <span>
                اضغط على زر <strong>«تثبيت التطبيق»</strong> أعلاه، أو افتح قائمة المتصفح (
                <strong>⋮</strong>) أعلى الشاشة.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#EEF7F0] text-xs font-extrabold text-[#167764]">
                ٣
              </span>
              <span>
                اختر <strong>«تثبيت التطبيق» (Install app)</strong> أو{' '}
                <strong>«إضافة إلى الشاشة الرئيسية»</strong> ثم أكّد التثبيت.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#EEF7F0] text-xs font-extrabold text-[#167764]">
                ٤
              </span>
              <span>
                ستظهر أيقونة <strong>«أبواب الخير»</strong> الرسمية على شاشتك ويفتح التطبيق بواجهة
                مستقلة كاملة.
              </span>
            </li>
          </ol>
        </section>

        {/* iPhone Safari Guide */}
        <section
          className={`rounded-3xl border bg-white p-6 space-y-4 ${
            isIOS
              ? 'order-first lg:order-none border-[#167764] ring-1 ring-[#167764]/20'
              : 'border-[#167764]/14'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FDF6E4] text-[#9A6F18]">
                <Share className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#0F4F42]">
                  تثبيت التطبيق على هواتف iPhone وiPad
                </h2>
                <p className="text-xs text-[#102A24]/65">عبر متصفح Safari — إضافة إلى الشاشة الرئيسية</p>
              </div>
            </div>
            {isIOS && (
              <span className="rounded-lg bg-[#FDF6E4] px-2.5 py-1 text-[11px] font-bold text-[#9A6F18]">
                جهازك الحالي
              </span>
            )}
          </div>

          <ol className="space-y-3 text-sm leading-7 text-[#102A24]/85">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FDF6E4] text-xs font-extrabold text-[#9A6F18]">
                ١
              </span>
              <span>
                افتح رابط التطبيق باستخدام متصفح <strong>Safari</strong> الرسمي على جهاز iPhone.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FDF6E4] text-xs font-extrabold text-[#9A6F18]">
                ٢
              </span>
              <span className="inline-flex flex-wrap items-center gap-1">
                اضغط على زر <strong>المشاركة (Share)</strong>{' '}
                <Share className="inline h-4 w-4 text-[#167764]" aria-hidden="true" /> في الشريط
                السفلي لمتصفح Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FDF6E4] text-xs font-extrabold text-[#9A6F18]">
                ٣
              </span>
              <span className="inline-flex flex-wrap items-center gap-1">
                مرّر القائمة للأسفل واضغط على{' '}
                <strong>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong>{' '}
                <PlusSquare className="inline h-4 w-4 text-[#167764]" aria-hidden="true" />.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FDF6E4] text-xs font-extrabold text-[#9A6F18]">
                ٤
              </span>
              <span>
                تأكد من ظهور اسم <strong>«أبواب الخير»</strong> والأيقونة الرسمية، ثم اضغط{' '}
                <strong>«إضافة» (Add)</strong> أعلى الشاشة.
              </span>
            </li>
          </ol>

          <div className="rounded-2xl border border-[#D9A436]/30 bg-[#FDF6E4]/75 p-3.5 text-xs leading-6 text-[#7A5610]">
            <strong>توضيح مهم لمستخدمي iPhone:</strong> نظام iOS يتيح تثبيت تطبيقات الويب التقدمية
            (PWA) حصراً عبر خطوة «إضافة إلى الشاشة الرئيسية» في Safari لتعمل في واجهة مستقلة بأيقونة
            الجمعية، ولا يدعم زر التثبيت التلقائي المباشر كما في Android دون توزيع حزمة iOS موقّعة
            عبر App Store.
          </div>
        </section>
      </div>

      {/* Security, Offline Policy & Direct Links Reference */}
      <section className="rounded-3xl border border-[#167764]/14 bg-white p-6 space-y-5">
        <h2 className="font-display text-base font-extrabold text-[#0F4F42]">
          ضمانات الأمان والخصوصية والتحديث التلقائي
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0F4F42]">
              <Lock className="h-4 w-4 text-[#167764]" aria-hidden="true" />
              <span>حماية البيانات الحساسة</span>
            </div>
            <p className="text-xs leading-6 text-[#102A24]/75">
              يتم تخزين ملفات الواجهة الأساسية فقط لتسريع التشغيل؛ ولا يتم مطلقاً حفظ بيانات الأسر
              المستفيدة أو التبرعات أو المعاملات المالية أو كلمات المرور في ذاكرة المتصفح المؤقتة.
            </p>
          </div>

          <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0F4F42]">
              <WifiOff className="h-4 w-4 text-[#167764]" aria-hidden="true" />
              <span>الانضباط عند انقطاع الإنترنت</span>
            </div>
            <p className="text-xs leading-6 text-[#102A24]/75">
              عند انقطاع الاتصال يعرض التطبيق تنبيهاً واضحاً ويوقف العمليات المالية والإدارية مؤقتاً
              لمنع أي تعارض أو فقدان للبيانات حتى عودة الاتصال.
            </p>
          </div>

          <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0F4F42]">
              <ShieldCheck className="h-4 w-4 text-[#167764]" aria-hidden="true" />
              <span>تحديثات تلقائية وآمنة</span>
            </div>
            <p className="text-xs leading-6 text-[#102A24]/75">
              يتحقق التطبيق تلقائياً من أي إصدار جديد ويحدّث ملفات الواجهة دون الحاجة لإعادة التثبيت،
              مع تطبيق كافة صلاحيات رئيس مجلس الإدارة والمديرين على الخادم.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-[#167764]/10 pt-4 sm:grid-cols-2 text-xs">
          <div className="rounded-xl bg-[#F7FAF8] px-3.5 py-2.5">
            <p className="font-bold text-[#0F4F42]">رابط صفحة التثبيت للمشاركة:</p>
            <p className="mt-1 truncate text-[#167764] font-mono" dir="ltr">
              {installUrl}
            </p>
          </div>
          <div className="rounded-xl bg-[#F7FAF8] px-3.5 py-2.5">
            <p className="font-bold text-[#0F4F42]">رابط تشغيل التطبيق المباشر:</p>
            <p className="mt-1 truncate text-[#167764] font-mono" dir="ltr">
              {appLaunchUrl}
            </p>
          </div>
        </div>
      </section>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col bg-[#F7FAF8] text-[#102A24]">
      <header className="sticky top-0 z-30 border-b border-[#167764]/12 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#0F4F42] transition-colors hover:bg-[#EEF7F0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>الصفحة الرئيسية</span>
          </button>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#167764]/15 bg-[#FBF2E0] p-1">
              <img
                src={OFFICIAL_LOGO_PATH}
                alt="أبواب الخير"
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="font-display text-base font-extrabold text-[#0F4F42] sm:text-lg">
              أبواب الخير
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {content}
      </main>

      <footer className="border-t border-[#167764]/12 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-5 text-center text-xs text-[#102A24]/65 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-semibold text-[#0F4F42]">أبواب الخير — طريقك للخير 💚</p>
          <p>© ٢٠٢٦ مؤسسة أبواب الخير · جميع الحقوق محفوظة</p>
        </div>
      </footer>

      <OfflineBanner />
    </div>
  );
}
