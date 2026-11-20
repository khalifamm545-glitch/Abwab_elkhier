import {AlertTriangle, CheckCircle2, X} from 'lucide-react';
import {useState} from 'react';

interface ConfirmDialogProps {
  open: boolean;
  titleAr: string;
  messageAr: string;
  confirmLabelAr?: string;
  cancelLabelAr?: string;
  tone?: 'danger' | 'primary' | 'warning';
  requireTextInput?: {
    labelAr: string;
    placeholderAr: string;
    minLength?: number;
  };
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (inputValue?: string) => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  titleAr,
  messageAr,
  confirmLabelAr = 'تأكيد التنفيذ',
  cancelLabelAr = 'إلغاء',
  tone = 'primary',
  requireTextInput,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  if (!open) return null;

  const minLen = requireTextInput?.minLength ?? 0;
  const inputValid = !requireTextInput || inputValue.trim().length >= minLen;

  const btnStyle =
    tone === 'danger'
      ? 'bg-red-700 hover:bg-red-800 text-white'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 text-white'
        : 'bg-[#167764] hover:bg-[#0F4F42] text-white';

  const handleConfirm = async () => {
    if (!inputValid || loading) return;
    await onConfirm(requireTextInput ? inputValue.trim() : undefined);
    setInputValue('');
  };

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="abwab-confirm-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A24]/45 p-3 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#167764]/18 bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                tone === 'danger'
                  ? 'bg-red-50 text-red-700'
                  : tone === 'warning'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-[#EEF7F0] text-[#167764]'
              }`}
            >
              {tone === 'primary' ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <h3
              id="abwab-confirm-title"
              className="font-display text-base font-extrabold text-[#0F4F42]"
            >
              {titleAr}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              onCancel();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#102A24]/60 hover:bg-[#EEF7F0] cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-[#102A24]/80">{messageAr}</p>

        {requireTextInput && (
          <div className="mt-4">
            <label className="block text-xs font-bold text-[#0F4F42]">
              {requireTextInput.labelAr}
            </label>
            <textarea
              rows={3}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={requireTextInput.placeholderAr}
              className="mt-1.5 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
            />
            {minLen > 0 && inputValue.trim().length < minLen && (
              <p className="mt-1 text-[11px] text-[#102A24]/60">
                يرجى إدخال {minLen} أحرف على الأقل للتوثيق.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              onCancel();
            }}
            disabled={loading}
            className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 py-2 text-sm font-semibold text-[#102A24] hover:bg-[#EEF7F0] cursor-pointer"
          >
            {cancelLabelAr}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !inputValid}
            className={`min-h-[44px] rounded-xl px-5 py-2 text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer ${btnStyle}`}
          >
            {loading ? 'جارٍ التنفيذ...' : confirmLabelAr}
          </button>
        </div>
      </div>
    </div>
  );
}
