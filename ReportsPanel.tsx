import {FileSpreadsheet, FileText, Printer, RefreshCw} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {api, ApiError} from '../../lib/api';
import {buildReportPrintHtml, exportReportToExcel} from '../../lib/exportUtils';
import {formatArabicDateTime} from '../../lib/formatters';
import type {
  GeneratedReportResponse,
  OrganizationSettings,
  ReportTypeId,
} from '../../types/auth';
import {ArabicPrintModal} from './ArabicPrintModal';

interface ReportsPanelProps {
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
}

const REPORT_CATALOG: Array<{id: ReportTypeId; labelAr: string}> = [
  {id: 'revenues', labelAr: 'تقرير الإيرادات'},
  {id: 'expenses', labelAr: 'تقرير المصروفات'},
  {id: 'treasury', labelAr: 'تقرير الخزينة والصناديق'},
  {id: 'donations', labelAr: 'تقرير التبرعات'},
  {id: 'donors', labelAr: 'تقرير المتبرعين'},
  {id: 'families', labelAr: 'تقرير الأسر المستفيدة'},
  {id: 'pensions', labelAr: 'تقرير معاشات الخير'},
  {id: 'assistances', labelAr: 'تقرير المساعدات الخيرية'},
  {id: 'projects', labelAr: 'تقرير المشروعات الخيرية'},
  {id: 'warehouse', labelAr: 'تقرير المخازن والعيني'},
  {id: 'volunteers', labelAr: 'تقرير المتطوعين'},
  {id: 'performance', labelAr: 'تقرير الأداء الشهري والسنوي'},
];

export function ReportsPanel({onFeedback}: ReportsPanelProps) {
  const visibleReports = REPORT_CATALOG;
  const [selectedReport, setSelectedReport] = useState<ReportTypeId>('revenues');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportData, setReportData] = useState<GeneratedReportResponse | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  const loadReport = useCallback(
    async (type: ReportTypeId, from: string, to: string) => {
      setLoading(true);
      try {
        const [rep, settingsRes] = await Promise.all([
          api.getReport(type, from || undefined, to || undefined),
          api.getSettings().catch(() => null),
        ]);
        setReportData(rep);
        if (settingsRes) setOrgSettings(settingsRes.settings);
      } catch (err) {
        onFeedback({
          type: 'error',
          text: err instanceof ApiError ? err.message : 'تعذر استخراج التقرير المطلوب.',
        });
      } finally {
        setLoading(false);
      }
    },
    [onFeedback],
  );

  useEffect(() => {
    void loadReport(selectedReport, dateFrom, dateTo);
  }, [selectedReport, dateFrom, dateTo, loadReport]);

  const handleExportExcel = () => {
    if (!reportData) return;
    exportReportToExcel(reportData);
    onFeedback({type: 'success', text: `تم تصدير «${reportData.titleAr}» إلى ملف Excel (.xlsx).`});
  };

  const handleOpenPdf = () => {
    if (!reportData) return;
    setPrintHtml(buildReportPrintHtml(reportData, orgSettings));
  };

  return (
    <div className="space-y-6">
      {/* Report Selector & Date Range Controls */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              مركز التقارير الرسمية والإحصائيات
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              ١٢ تقريراً مالياً وإدارياً وخيرياً حياً من قاعدة البيانات مع تصدير مباشر بصيغتي Excel (.xlsx) وPDF عربي.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!reportData || loading}
              onClick={handleExportExcel}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#167764]/22 bg-[#EEF7F0] px-4 py-2 text-xs font-bold text-[#0F4F42] hover:bg-[#dff0e3] disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#167764]" aria-hidden="true" />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              disabled={!reportData || loading}
              onClick={handleOpenPdf}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>تصدير وطباعة PDF عربي</span>
            </button>
          </div>
        </div>

        {/* 12 Reports Grid Selector */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visibleReports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedReport(r.id)}
              className={`min-h-[44px] rounded-xl border px-3 py-2 text-right text-xs font-bold transition-colors cursor-pointer ${
                selectedReport === r.id
                  ? 'border-[#167764] bg-[#167764] text-white'
                  : 'border-[#167764]/16 bg-[#F7FAF8] text-[#0F4F42] hover:bg-[#EEF7F0]'
              }`}
            >
              {r.labelAr}
            </button>
          ))}
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-end gap-3 border-t border-[#167764]/10 pt-4">
          <div>
            <label className="block text-[11px] font-bold text-[#0F4F42]">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#0F4F42]">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 min-h-[42px] rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-xs tabular-nums"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="min-h-[42px] rounded-xl border border-[#167764]/20 bg-white px-3 text-xs font-semibold text-[#0F4F42] cursor-pointer"
            >
              إزالة التصفية
            </button>
          )}
          <button
            type="button"
            onClick={() => loadReport(selectedReport, dateFrom, dateTo)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-white px-3 text-xs font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </section>

      {/* Report Preview */}
      {loading && !reportData ? (
        <div className="h-56 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : reportData ? (
        <section className="rounded-3xl border border-[#167764]/14 bg-white p-5 sm:p-6 space-y-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-[#167764]/10 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#167764]" aria-hidden="true" />
              <h3 className="font-display text-lg font-extrabold text-[#0F4F42]">
                {reportData.titleAr}
              </h3>
            </div>
            <p className="text-[11px] text-[#102A24]/60">
              آخر تحديث: {formatArabicDateTime(reportData.generatedAt)}
            </p>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {reportData.summaryMetrics.map((m) => (
              <div key={m.labelAr} className="rounded-2xl bg-[#EEF7F0]/65 p-4">
                <p className="text-xs font-semibold text-[#32764C]">{m.labelAr}</p>
                <p className="mt-1 font-display text-xl font-extrabold tabular-nums text-[#0F4F42]">
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {reportData.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#167764]/20 bg-[#F7FAF8] p-8 text-center">
              <p className="text-sm font-bold text-[#0F4F42]">
                لا توجد بيانات مسجلة في هذا التقرير ضمن الفترة المختارة
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="space-y-3 md:hidden">
                {reportData.rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-3.5 space-y-1.5 text-xs"
                  >
                    {reportData.columns.map((col) => (
                      <div key={col.key} className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#32764C] shrink-0">{col.labelAr}:</span>
                        <span className="font-bold text-[#0F4F42] text-left tabular-nums">
                          {String(row[col.key] ?? '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Desktop / Tablet Responsive Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#167764]/12">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#0F4F42] text-white">
                    <tr>
                      {reportData.columns.map((col) => (
                        <th key={col.key} className="px-3.5 py-3 font-bold whitespace-nowrap">
                          {col.labelAr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#167764]/10">
                    {reportData.rows.map((row, idx) => (
                      <tr key={idx} className="odd:bg-white even:bg-[#F7FAF8]/70">
                        {reportData.columns.map((col) => (
                          <td key={col.key} className="px-3.5 py-2.5 text-[#102A24] tabular-nums">
                            {String(row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      <ArabicPrintModal
        open={Boolean(printHtml)}
        titleAr={reportData?.titleAr || 'تقرير رسمي'}
        htmlContent={printHtml || ''}
        onClose={() => setPrintHtml(null)}
      />
    </div>
  );
}
