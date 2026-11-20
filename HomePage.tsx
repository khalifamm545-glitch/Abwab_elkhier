import {Download, LayoutDashboard, LogIn, Smartphone} from 'lucide-react';
import {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {OfflineBanner, PWAInstallButton} from './PWAInstallButton';

const HERO_BANNER_SRC = '/assets/aistudio/file_000000009e348246a0572bdc01f23bb8_a7581726.png';
const OFFICIAL_LOGO_SRC = '/assets/aistudio/file_0000000071846246a5e447d580e3e2b3_2_f9a3a92b.png';

const MISSION_PILLARS = [
  {
    number: '٠١',
    title: 'رعاية الأسر وكرامة العطاء',
    description:
      'نصل بالدعم المنتظم والمساعدات العاجلة إلى الأسر الأولى بالرعاية بما يصون كرامتها ويعزز استقرارها.',
  },
  {
    number: '٠٢',
    title: 'شفافية وأمانة مؤسسية',
    description:
      'نعمل بوضوح كامل وانضباط مالي وإداري يضع ثقة المتبرعين ومصلحة المستفيدين في مقدمة أولوياتنا.',
  },
  {
    number: '٠٣',
    title: 'كل يوم باب جديد للخير',
    description:
      'من الكفالات الشهرية إلى الإغاثة الطبية وتفريج الكربات، نفتح معاً أبواباً متجددة للأمل والعطاء.',
  },
];

interface HomePageProps {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
  onOpenInstallPage: () => void;
}

export function HomePage({
  isAuthenticated,
  onOpenLogin,
  onOpenDashboard,
  onOpenInstallPage,
}: HomePageProps) {
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const {isInstallable, isInstalled, install} = usePWAInstall();

  return (
    <div dir="rtl" className="min-h-dvh flex flex-col bg-[#F7FAF8] text-[#102A24]">
      {/* Compact Mobile-First Sticky Top Bar (<= 64px) */}
      <header className="sticky top-0 z-30 border-b border-[#167764]/12 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="flex min-h-[44px] min-w-0 items-center gap-2 sm:gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#167764]/15 bg-[#FBF2E0] p-1 sm:h-11 sm:w-11">
              {!logoError ? (
                <img
                  src={OFFICIAL_LOGO_SRC}
                  alt="شعار مؤسسة أبواب الخير"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs font-extrabold text-[#167764]">أبواب</span>
              )}
            </div>
            <span className="font-display text-base font-extrabold tracking-tight text-[#0F4F42] whitespace-nowrap shrink-0 sm:text-xl">
              أبواب الخير
            </span>
          </a>

          <div className="flex items-center gap-1.5 shrink-0 sm:gap-2.5">
            <PWAInstallButton onOpenInstallPage={onOpenInstallPage} />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#167764] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F4F42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764] whitespace-nowrap shrink-0 cursor-pointer sm:gap-2 sm:px-4 sm:text-sm"
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>لوحة التحكم</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#167764] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F4F42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764] whitespace-nowrap shrink-0 cursor-pointer sm:gap-2 sm:px-4 sm:text-sm"
              >
                <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>تسجيل الدخول</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content — Preserved Verbatim */}
      <main id="top" className="flex-1">
        {/* Official Hero Banner Section */}
        <section aria-label="اللافتة الرسمية لمؤسسة أبواب الخير" className="bg-white border-b border-[#167764]/10">
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="overflow-hidden rounded-2xl border border-[#167764]/15 bg-[#FBF2E0] sm:rounded-3xl">
              {!bannerError ? (
                <img
                  src={HERO_BANNER_SRC}
                  alt="أبواب الخير — طريقك للخير وهنفتح كل يوم باب جديد للخير"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerError(true)}
                  className="block h-auto w-full object-contain"
                />
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#EEF7F0] to-[#FBF2E0] px-6 py-10 text-center">
                  <p className="font-display text-2xl font-extrabold text-[#0F4F42]">
                    أبواب الخير ... طريقك للخير 💚
                  </p>
                  <p className="font-display text-lg font-bold text-[#32764C]">
                    وهنفتح كل يوم باب جديد للخير 💚
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Primary Welcome Section */}
        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="rounded-3xl border border-[#167764]/12 bg-white px-6 py-8 sm:px-10 sm:py-12">
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              {/* Official Central Emblem */}
              <div className="mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-[#167764]/15 bg-[#FBF2E0] p-2 sm:h-28 sm:w-28">
                {!logoError ? (
                  <img
                    src={OFFICIAL_LOGO_SRC}
                    alt="الشعار الرسمي لأبواب الخير"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-xl font-extrabold text-[#167764]">
                    أبواب الخير
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-[#32764C]">
                مؤسسة خيرية مصرية للتكافل والعمل الإنساني
              </p>

              <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-[#0F4F42] sm:text-5xl">
                أهلاً بكم في أبواب الخير
              </h1>

              <div className="mt-5 space-y-1.5">
                <p className="font-display text-lg font-bold text-[#167764] sm:text-xl">
                  أبواب الخير ... طريقك للخير 💚
                </p>
                <p className="font-display text-base font-semibold text-[#32764C] sm:text-lg">
                  وهنفتح كل يوم باب جديد للخير 💚
                </p>
              </div>

              <div className="my-7 h-px w-24 bg-[#67B477]/45" aria-hidden="true" />

              <p className="text-base leading-8 text-[#102A24]/85 sm:text-lg sm:leading-9">
                مرحباً بكم في التطبيق الرسمي لمؤسسة <strong className="font-bold text-[#0F4F42]">أبواب الخير</strong>.
                نسعد بوجودكم معنا في رحلة العطاء والتكافل الإنساني، حيث نعمل معاً لدعم الأسر المستحقة
                ورسم الأمل في حياتهم كل يوم بروح من الصدق والشفافية والمسؤولية.
              </p>

              <p className="mt-4 text-sm leading-7 text-[#102A24]/70 sm:text-base">
                عطاؤك اليوم يفتح باباً للأمل غداً — كُن سبباً في تغيير حياة إنسان.
              </p>

              {/* Direct Mobile-Ready Launch & Install Actions */}
              <div className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={isAuthenticated ? onOpenDashboard : onOpenLogin}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#167764] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#0F4F42] cursor-pointer sm:w-auto"
                >
                  {isAuthenticated ? (
                    <>
                      <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>فتح لوحة التحكم</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>تسجيل الدخول إلى النظام</span>
                    </>
                  )}
                </button>

                {!isInstalled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isInstallable) {
                        void install();
                      } else {
                        onOpenInstallPage();
                      }
                    }}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#167764]/25 bg-[#EEF7F0] px-6 py-3 text-sm font-bold text-[#0F4F42] transition-colors hover:bg-[#dff0e3] cursor-pointer sm:w-auto"
                  >
                    {isInstallable ? (
                      <>
                        <Download className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
                        <span>تثبيت التطبيق على الهاتف</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
                        <span>تثبيت التطبيق على Android وiPhone</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Quiet Mission Pillars Strip (Clean Hairline Dividers, Zero Pills) */}
        <section
          aria-label="قيم مؤسسة أبواب الخير"
          className="mx-auto max-w-5xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8"
        >
          <div className="rounded-3xl border border-[#167764]/12 bg-[#EEF7F0]/75 px-6 py-7 sm:px-10 sm:py-9">
            <div className="grid grid-cols-1 divide-y divide-[#167764]/12 md:grid-cols-3 md:divide-x md:divide-x-reverse md:divide-y-0">
              {MISSION_PILLARS.map((pillar) => (
                <div
                  key={pillar.number}
                  className="py-5 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pr-0 md:last:pl-0"
                >
                  <p className="font-display text-sm font-bold text-[#32764C]">{pillar.number}</p>
                  <h2 className="mt-1.5 font-display text-lg font-bold text-[#0F4F42]">
                    {pillar.title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[#102A24]/80">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Arabic Footer */}
      <footer className="border-t border-[#167764]/12 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-sm text-[#102A24]/65 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-semibold text-[#0F4F42]">أبواب الخير — طريقك للخير 💚</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={onOpenInstallPage}
              className="text-xs font-bold text-[#167764] hover:text-[#0F4F42] hover:underline cursor-pointer"
            >
              تثبيت تطبيق أبواب الخير على الهاتف
            </button>
            <span aria-hidden="true" className="text-[#167764]/30">
              ·
            </span>
            <p>© ٢٠٢٦ مؤسسة أبواب الخير · جميع الحقوق محفوظة</p>
          </div>
        </div>
      </footer>

      <OfflineBanner />
    </div>
  );
}
