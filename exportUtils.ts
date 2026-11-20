import * as XLSX from 'xlsx';
import {
  DONATION_CATEGORY_LABELS_AR,
  FUND_POOL_LABELS_AR,
  PAYMENT_METHOD_LABELS_AR,
  type DonationRecord,
  type GeneratedReportResponse,
  type OrganizationSettings,
} from '../types/auth';
import {formatArabicDateTime, formatEGP} from './formatters';

export const OFFICIAL_LOGO_PATH =
  '/assets/aistudio/file_0000000071846246a5e447d580e3e2b3_2_f9a3a92b.png';

function escapeHtml(val: string | number | null | undefined): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Exports any live report to a real RTL Arabic Excel (.xlsx) workbook using SheetJS.
 */
export function exportReportToExcel(report: GeneratedReportResponse): void {
  const headerRow = report.columns.map((c) => c.labelAr);
  const dataRows = report.rows.map((row) =>
    report.columns.map((c) => (row[c.key] !== undefined && row[c.key] !== null ? row[c.key] : '')),
  );

  const summaryRows: Array<Array<string | number>> = [
    ['جمعية أبواب الخير — نظام الإدارة المتكامل'],
    [report.titleAr],
    [`تاريخ الاستخراج: ${formatArabicDateTime(report.generatedAt)}`],
    [],
    ...report.summaryMetrics.map((m) => [m.labelAr, m.value]),
    [],
    headerRow,
    ...dataRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(summaryRows);
  worksheet['!views'] = [{RTL: true}];
  worksheet['!cols'] = report.columns.map(() => ({wch: 22}));

  const workbook = XLSX.utils.book_new();
  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{RTL: true}];

  const safeSheetName = report.titleAr.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'تقرير';
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const fileDate = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `abwab-alkhair-${report.reportType}-${fileDate}.xlsx`);
}

/**
 * Downloads a JSON database backup file safely via Blob URL (no window.open).
 */
export function downloadJsonFile(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates clean, native vector Arabic RTL printable HTML for Donation Receipts (PDF via Print).
 */
export function buildDonationReceiptHtml(
  donation: DonationRecord,
  org?: OrganizationSettings | null,
): string {
  const orgName = org?.nameAr || 'أبواب الخير';
  const slogan = org?.sloganAr || 'أبواب الخير ... طريقك للخير 💚';
  const regNo = org?.registrationNumber ? `رقم الإشهار: ${org.registrationNumber}` : '';
  const contactLine = [org?.phone, org?.address].filter(Boolean).join(' · ');
  const footer =
    org?.receiptFooterAr || 'شكراً لعطائكم — عطاؤك اليوم يفتح باباً للأمل غداً.';
  const signer = org?.authorizedSignerName || 'رئيس مجلس الإدارة';
  const logoSrc = org?.customLogoUrl || OFFICIAL_LOGO_PATH;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>إيصال تبرع رسمي ${escapeHtml(donation.receiptNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      color: #102A24;
      background: #FFFFFF;
      direction: rtl;
    }
    .receipt {
      max-width: 720px;
      margin: 0 auto;
      border: 2px solid #167764;
      border-radius: 18px;
      padding: 28px;
      background: #FFFFFF;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #EEF7F0;
      padding-bottom: 18px;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 72px; height: 72px; object-fit: contain; border-radius: 14px; border: 1px solid #d7eadc; padding: 4px; background: #fff; }
    .brand h1 { margin: 0; font-family: 'Cairo', sans-serif; font-size: 24px; color: #0F4F42; }
    .brand p { margin: 4px 0 0; font-size: 13px; color: #32764C; font-weight: 600; }
    .receipt-meta { text-align: left; }
    .receipt-badge {
      display: inline-block;
      background: #0F4F42;
      color: #FFFFFF;
      font-family: 'Cairo', sans-serif;
      font-weight: 800;
      font-size: 15px;
      padding: 6px 14px;
      border-radius: 10px;
    }
    .receipt-no { margin-top: 8px; font-weight: 700; font-size: 14px; color: #167764; direction: ltr; }
    .amount-box {
      margin: 22px 0;
      background: #EEF7F0;
      border: 1px solid #67B477;
      border-radius: 14px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .amount-box .label { font-size: 14px; font-weight: 700; color: #0F4F42; }
    .amount-box .value { font-family: 'Cairo', sans-serif; font-size: 28px; font-weight: 800; color: #0F4F42; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    td { padding: 10px 12px; border-bottom: 1px solid #e6f0ea; font-size: 14px; }
    td.k { width: 34%; color: #32764C; font-weight: 700; background: #F7FAF8; }
    td.v { color: #102A24; font-weight: 600; }
    .signatures {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding-top: 18px;
      border-top: 1px dashed #167764;
      font-size: 13px;
    }
    .sig-col { text-align: center; flex: 1; }
    .sig-line { margin-top: 32px; border-top: 1px solid #102A24; padding-top: 6px; font-weight: 700; color: #0F4F42; }
    .footer {
      margin-top: 22px;
      text-align: center;
      font-size: 12px;
      color: #32764C;
      background: #F7FAF8;
      padding: 10px;
      border-radius: 10px;
    }
    @media print {
      body { padding: 0; }
      .receipt { border-width: 1.5px; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">
        <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(orgName)}" />
        <div>
          <h1>${escapeHtml(orgName)}</h1>
          <p>${escapeHtml(slogan)}</p>
          ${regNo ? `<div style="font-size:11px;color:#526b64;margin-top:4px">${escapeHtml(regNo)}</div>` : ''}
        </div>
      </div>
      <div class="receipt-meta">
        <span class="receipt-badge">إيصال استلام تبرع رسمي</span>
        <div class="receipt-no">${escapeHtml(donation.receiptNumber)}</div>
        <div style="font-size:12px;color:#526b64;margin-top:4px">التاريخ: ${escapeHtml(donation.donationDate)}</div>
      </div>
    </div>

    <div class="amount-box">
      <span class="label">${donation.category === 'in_kind' ? 'تبرع عيني موثّق' : 'المبلغ المستلم (بالجنيه المصري)'}</span>
      <span class="value">${
        donation.category === 'in_kind' && Number(donation.amount) === 0
          ? 'تبرع عيني'
          : `${escapeHtml(formatEGP(donation.amount))} ج.م`
      }</span>
    </div>

    <table>
      <tr><td class="k">اسم المتبرع الكريم</td><td class="v">${escapeHtml(donation.donorName)}</td></tr>
      ${donation.donorPhone ? `<tr><td class="k">رقم الهاتف</td><td class="v" dir="ltr" style="text-align:right">${escapeHtml(donation.donorPhone)}</td></tr>` : ''}
      <tr><td class="k">نوع التبرع</td><td class="v">${escapeHtml(DONATION_CATEGORY_LABELS_AR[donation.category])}</td></tr>
      <tr><td class="k">الصندوق المالي المخصّص</td><td class="v">${escapeHtml(FUND_POOL_LABELS_AR[donation.fundType])}</td></tr>
      <tr><td class="k">وسيلة الاستلام</td><td class="v">${escapeHtml(PAYMENT_METHOD_LABELS_AR[donation.paymentMethod])}</td></tr>
      ${donation.treasuryAccountName ? `<tr><td class="k">الخزينة / الحساب المستلم</td><td class="v">${escapeHtml(donation.treasuryAccountName)}</td></tr>` : ''}
      ${donation.projectName ? `<tr><td class="k">المشروع الخيري المخصص</td><td class="v">${escapeHtml(donation.projectName)}</td></tr>` : ''}
      ${donation.inKindDescription ? `<tr><td class="k">بيان التبرع العيني</td><td class="v">${escapeHtml(donation.inKindDescription)}</td></tr>` : ''}
      <tr><td class="k">الموظف / المسجّل</td><td class="v">${escapeHtml(donation.recordedByName)}</td></tr>
      ${donation.notes ? `<tr><td class="k">ملاحظات</td><td class="v">${escapeHtml(donation.notes)}</td></tr>` : ''}
    </table>

    <div class="signatures">
      <div class="sig-col">
        <div>توقيع المستلم</div>
        <div class="sig-line">${escapeHtml(donation.recordedByName)}</div>
      </div>
      <div class="sig-col">
        <div>الاعتماد والختم الرسمي</div>
        <div class="sig-line">${escapeHtml(signer)}</div>
      </div>
    </div>

    <div class="footer">
      <div>${escapeHtml(footer)}</div>
      ${contactLine ? `<div style="margin-top:4px;color:#526b64">${escapeHtml(contactLine)}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates clean Arabic RTL printable HTML for any of the 12 official reports (PDF via Print).
 */
export function buildReportPrintHtml(
  report: GeneratedReportResponse,
  org?: OrganizationSettings | null,
): string {
  const orgName = org?.nameAr || 'أبواب الخير';
  const slogan = org?.sloganAr || 'أبواب الخير ... طريقك للخير 💚';
  const logoSrc = org?.customLogoUrl || OFFICIAL_LOGO_PATH;
  const periodLabel =
    report.dateFrom || report.dateTo
      ? `الفترة: من ${report.dateFrom || 'البداية'} إلى ${report.dateTo || 'اليوم'}`
      : 'الفترة: كافة السجلات المعتمدة';

  const metricsHtml = report.summaryMetrics
    .map(
      (m) => `<div class="metric"><div class="ml">${escapeHtml(m.labelAr)}</div><div class="mv">${escapeHtml(m.value)}</div></div>`,
    )
    .join('');

  const headHtml = report.columns.map((c) => `<th>${escapeHtml(c.labelAr)}</th>`).join('');
  const bodyHtml =
    report.rows.length === 0
      ? `<tr><td colspan="${report.columns.length}" style="text-align:center;padding:24px;color:#526b64">لا توجد سجلات مطابقة في الفترة المحددة.</td></tr>`
      : report.rows
          .map(
            (r) =>
              `<tr>${report.columns.map((c) => `<td>${escapeHtml(r[c.key])}</td>`).join('')}</tr>`,
          )
          .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(report.titleAr)} — ${escapeHtml(orgName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; font-family: 'IBM Plex Sans Arabic', sans-serif; color: #102A24; background: #fff; direction: rtl; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #167764; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 58px; height: 58px; object-fit: contain; border-radius: 10px; border: 1px solid #d7eadc; padding: 3px; }
    .brand h1 { margin: 0; font-family: 'Cairo', sans-serif; font-size: 20px; color: #0F4F42; }
    .brand p { margin: 3px 0 0; font-size: 12px; color: #32764C; }
    .meta { text-align: left; font-size: 12px; color: #32544b; }
    .title { font-family: 'Cairo', sans-serif; font-size: 18px; color: #0F4F42; margin: 0 0 12px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .metric { background: #EEF7F0; border: 1px solid #cde3d3; border-radius: 10px; padding: 10px 12px; }
    .ml { font-size: 11px; color: #32764C; font-weight: 600; }
    .mv { font-family: 'Cairo', sans-serif; font-size: 16px; font-weight: 800; color: #0F4F42; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #0F4F42; color: #fff; padding: 9px 8px; text-align: right; font-weight: 700; }
    td { padding: 8px; border-bottom: 1px solid #e3eee7; vertical-align: top; }
    tr:nth-child(even) td { background: #F7FAF8; }
    .footer { margin-top: 20px; font-size: 11px; color: #526b64; text-align: center; border-top: 1px solid #e3eee7; padding-top: 10px; }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(orgName)}" />
      <div>
        <h1>${escapeHtml(orgName)}</h1>
        <p>${escapeHtml(slogan)}</p>
      </div>
    </div>
    <div class="meta">
      <div><strong>${escapeHtml(periodLabel)}</strong></div>
      <div>تاريخ الطباعة: ${escapeHtml(formatArabicDateTime(report.generatedAt))}</div>
    </div>
  </div>
  <h2 class="title">${escapeHtml(report.titleAr)}</h2>
  <div class="metrics">${metricsHtml}</div>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  <div class="footer">تم استخراج هذا التقرير رسمياً من نظام إدارة جمعية ${escapeHtml(orgName)} — جميع القيم المالية بالجنيه المصري (ج.م).</div>
</body>
</html>`;
}

/**
 * Prints an HTML document cleanly via a hidden in-page iframe (never calls window.open).
 */
export function printHtmlViaHiddenIframe(html: string): void {
  const existing = document.getElementById('abwab-hidden-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'abwab-hidden-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 3000);
    }
  };

  setTimeout(triggerPrint, 350);
}
