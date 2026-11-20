import {Download, Share, Smartphone, WifiOff, X} from 'lucide-react';
import {useState} from 'react';
import {useOnlineStatus, usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onOpenInstallPage?: () => void;
}

export function PWAInstallButton({onOpenInstallPage}: PWAInstallButtonProps) {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#167764]/25 bg-[#EEF7F0] px-2.5 py-2 text-xs font-bold text-[#0F4F42] transition-colors hover:bg-[#dff0e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764] whitespace-nowrap shrink-0 cursor-pointer sm:gap-2 sm:px-3.5 sm:text-sm"
      >
        <Download className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
        <span className="sm:hidden">تثبيت</span>
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </button>
    );
  }

  if (onOpenInstallPage) {
    return (
      <button
        type="button"
        onClick={onOpenInstallPage}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#167764]/25 bg-[#EEF7F0] px-2.5 py-2 text-xs font-bold text-[#0F4F42] transition-colors hover:bg-[#dff0e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764] whitespace-nowrap shrink-0 cursor-pointer sm:gap-2 sm:px-3.5 sm:text-sm"
      >
        <Smartphone className="h-4 w-4 shrink-0 text-[#167764]" aria-hidden="true" />
        <span className="sm:hidden">تثبيت</span>
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-2 text-sm font-semibold text-[#0F4F42] transition-colors hover:bg-[#dff0e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167764] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>تثبيت على آيفون</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-right shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <h2 id="ios-install-title" className="text-lg font-bold text-[#0F4F42]">
                  تثبيت أبواب الخير على آيفون
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="إغلاق"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#102A24]/70 transition-colors hover:bg-[#EEF7F0] hover:text-[#0F4F42] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm leading-7 text-[#102A24]/85">
                <li>١. افتح رابط التطبيق داخل متصفح Safari.</li>
                <li>٢. اضغط على زر «مشاركة» (Share) في شريط المتصفح.</li>
                <li>٣. مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
                <li>٤. اضغط على «إضافة» لفتح أبواب الخير في واجهة مستقلة.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 min-h-[44px] w-full rounded-xl bg-[#167764] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F4F42] cursor-pointer"
              >
                حسناً
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed right-4 bottom-4 left-4 z-50 mx-auto flex max-w-xl items-start gap-2.5 rounded-2xl border border-[#D9A436]/40 bg-[#0F4F42] px-4 py-3 text-right text-xs font-semibold leading-6 text-white shadow-xl sm:text-sm"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[#F4D078]" aria-hidden="true" />
      <span>
        أنت غير متصل بالإنترنت حالياً — تم إيقاف العمليات المالية والإدارية مؤقتاً ولا تُخزَّن أي
        بيانات حساسة دون اتصال حفاظاً على أمان ودقة سجلات الجمعية.
      </span>
    </div>
  );
}
