import {OFFICIAL_LOGO_PATH} from '../lib/exportUtils';

export function SplashScreen() {
  return (
    <div
      dir="rtl"
      role="status"
      aria-label="جارٍ تشغيل تطبيق أبواب الخير"
      className="min-h-dvh flex flex-col items-center justify-center bg-[#F8F2E4] px-6 text-center text-[#102A24]"
    >
      <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-3xl border border-[#167764]/18 bg-[#FBF2E0] p-3 shadow-sm sm:h-40 sm:w-40">
        <img
          src={OFFICIAL_LOGO_PATH}
          alt="الشعار الرسمي لمؤسسة أبواب الخير"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      </div>
      <h1 className="mt-5 font-display text-2xl font-extrabold text-[#0F4F42] sm:text-3xl">
        أبواب الخير
      </h1>
      <p className="mt-1.5 text-sm font-semibold text-[#167764]">
        أبواب الخير ... طريقك للخير 💚
      </p>
      <div
        className="mt-6 h-1.5 w-36 overflow-hidden rounded-full bg-[#167764]/15"
        aria-hidden="true"
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[#167764]" />
      </div>
    </div>
  );
}
