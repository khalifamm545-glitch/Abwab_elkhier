import {Printer, X} from 'lucide-react';
import {printHtmlViaHiddenIframe} from '../../lib/exportUtils';

interface ArabicPrintModalProps {
  open: boolean;
  titleAr: string;
  htmlContent: string;
  onClose: () => void;
}

export function ArabicPrintModal({open, titleAr, htmlContent, onClose}: ArabicPrintModalProps) {
  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={titleAr}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A24]/55 p-2 backdrop-blur-xs sm:p-5"
    >
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#167764]/20 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#167764]/12 bg-[#F7FAF8] px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h3 className="font-display text-base font-extrabold text-[#0F4F42] truncate">
              {titleAr}
            </h3>
            <p className="text-xs text-[#102A24]/65">
              يمكنك الطباعة مباشرة أو اختيار «حفظ كـ PDF» من نافذة الطباعة باللغة العربية الكاملة.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => printHtmlViaHiddenIframe(htmlContent)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>طباعة / حفظ PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#167764]/18 bg-white text-[#102A24] hover:bg-[#EEF7F0] cursor-pointer"
              aria-label="إغلاق المعاينة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#EEF7F0]/40 p-2 sm:p-4">
          <iframe
            title={titleAr}
            srcDoc={htmlContent}
            className="h-full w-full rounded-2xl border border-[#167764]/15 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
