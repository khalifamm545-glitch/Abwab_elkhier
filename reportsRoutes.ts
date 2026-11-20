import {createUniversalRouter} from './universalRouter.ts';
import {
  DONATION_CATEGORY_LABELS_AR,
  ELIGIBILITY_LABELS_AR,
  FAMILY_APPROVAL_LABELS_AR,
  FINANCIAL_PURPOSE_LABELS_AR,
  FUND_POOL_LABELS_AR,
  PAYMENT_METHOD_LABELS_AR,
  PENSION_STATUS_LABELS_AR,
  PROJECT_CATEGORY_LABELS_AR,
  WAREHOUSE_CATEGORY_LABELS_AR,
  WAREHOUSE_CONDITION_LABELS_AR,
  WORKFLOW_STATUS_LABELS_AR,
  type GeneratedReportResponse,
  type ReportTypeId,
} from '../src/types/auth.ts';
import {formatPiastersToDecimal, parseMoneyToPiasters} from './authSecurity.ts';
import {readAuthStore} from './authStore.ts';
import {
  requireAuth,
  requireGranular,
  requireModule,
  requireRoles,
  type AuthedRequest,
} from './middleware.ts';

export const reportsApiRouter = createUniversalRouter();

function filterByDateRange<T>(
  items: T[],
  getDate: (item: T) => string,
  from: string | null,
  to: string | null,
): T[] {
  return items.filter((item) => {
    const d = (getDate(item) || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

reportsApiRouter.get(
  '/reports/:reportType',
  requireAuth,
  requireRoles(['president', 'manager']),
  requireModule('reports', 'التقارير والإحصائيات'),
  requireGranular('canExportReports', 'استخراج وتصدير التقارير'),
  (req: AuthedRequest, res) => {
    const reportType = req.params.reportType as ReportTypeId;
    const dateFrom = typeof req.query.from === 'string' && req.query.from ? req.query.from : null;
    const dateTo = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;
    const state = readAuthStore();

    const generatedAt = new Date().toISOString();
    let report: GeneratedReportResponse;

    if (reportType === 'revenues' || reportType === 'donations') {
      const list = filterByDateRange(state.donations, (d) => d.donationDate, dateFrom, dateTo);
      const totalP = list
        .filter((d) => d.category !== 'in_kind')
        .reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
      report = {
        reportType,
        titleAr: reportType === 'revenues' ? 'تقرير الإيرادات المالية' : 'تقرير التبرعات الشامل',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي التبرعات النقدية', value: `${formatPiastersToDecimal(totalP)} ج.م`},
          {labelAr: 'عدد عمليات التبرع', value: String(list.length)},
          {
            labelAr: 'عمليات التبرع العيني',
            value: String(list.filter((d) => d.category === 'in_kind').length),
          },
        ],
        columns: [
          {key: 'receiptNumber', labelAr: 'رقم الإيصال'},
          {key: 'donationDate', labelAr: 'التاريخ'},
          {key: 'donorName', labelAr: 'المتبرع'},
          {key: 'categoryAr', labelAr: 'نوع التبرع'},
          {key: 'fundAr', labelAr: 'الصندوق المالي'},
          {key: 'paymentAr', labelAr: 'طريقة الاستلام'},
          {key: 'amount', labelAr: 'القيمة (ج.م)'},
          {key: 'projectName', labelAr: 'المشروع المخصص'},
          {key: 'recordedByName', labelAr: 'المسجّل'},
        ],
        rows: list.map((d) => ({
          receiptNumber: d.receiptNumber,
          donationDate: d.donationDate,
          donorName: d.donorName,
          categoryAr: DONATION_CATEGORY_LABELS_AR[d.category],
          fundAr: FUND_POOL_LABELS_AR[d.fundType],
          paymentAr: PAYMENT_METHOD_LABELS_AR[d.paymentMethod],
          amount: d.amount,
          projectName: d.projectName || 'عام',
          recordedByName: d.recordedByName,
        })),
      };
    } else if (reportType === 'expenses') {
      const finTx = filterByDateRange(
        state.financialTransactions.filter(
          (t) =>
            t.workflowStatus === 'executed' &&
            (t.txType === 'expense' || t.txType === 'aid_disbursement'),
        ),
        (t) => t.txDate,
        dateFrom,
        dateTo,
      );
      const pensions = filterByDateRange(
        state.monthlyDisbursements,
        (d) => d.recordedAt,
        dateFrom,
        dateTo,
      );
      const totalP =
        finTx.reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n) +
        pensions.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);

      report = {
        reportType,
        titleAr: 'تقرير المصروفات والمنصرفات المعتمدة',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي المصروفات المنفذة', value: `${formatPiastersToDecimal(totalP)} ج.م`},
          {labelAr: 'القيود المالية المنفذة', value: String(finTx.length)},
          {labelAr: 'دفعات المعاشات المصروفة', value: String(pensions.length)},
        ],
        columns: [
          {key: 'ref', labelAr: 'رقم القيد'},
          {key: 'date', labelAr: 'التاريخ'},
          {key: 'title', labelAr: 'البيان'},
          {key: 'purpose', labelAr: 'البند'},
          {key: 'fund', labelAr: 'الصندوق'},
          {key: 'amount', labelAr: 'المبلغ (ج.م)'},
          {key: 'approver', labelAr: 'المعتمد'},
          {key: 'executor', labelAr: 'المنفّذ'},
        ],
        rows: [
          ...finTx.map((t) => ({
            ref: t.entryNumber,
            date: t.txDate,
            title: t.title,
            purpose: FINANCIAL_PURPOSE_LABELS_AR[t.purposeCategory],
            fund: FUND_POOL_LABELS_AR[t.fundType],
            amount: t.amount,
            approver: t.approvedByName || '—',
            executor: t.executedByName || '—',
          })),
          ...pensions.map((d) => ({
            ref: `PEN-${d.monthKey}`,
            date: d.recordedAt.slice(0, 10),
            title: `صرف معاش / مساعدة شهرية (${d.familyFileNumber})`,
            purpose: 'معاشات الخير',
            fund: FUND_POOL_LABELS_AR[d.fundType],
            amount: d.amount,
            approver: 'معتمد بالخطة الشهرية',
            executor: d.recordedByName,
          })),
        ],
      };
    } else if (reportType === 'treasury') {
      const totalBal = state.treasuryAccounts.reduce(
        (acc, a) => acc + parseMoneyToPiasters(a.currentBalance),
        0n,
      );
      report = {
        reportType,
        titleAr: 'تقرير الخزينة والحسابات البنكية وفصل الصناديق',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'الرصيد الإجمالي الحالي', value: `${formatPiastersToDecimal(totalBal)} ج.م`},
          {labelAr: 'عدد الحسابات النشطة', value: String(state.treasuryAccounts.length)},
        ],
        columns: [
          {key: 'name', labelAr: 'الحساب / الخزينة'},
          {key: 'typeAr', labelAr: 'النوع'},
          {key: 'zakat_mal', labelAr: 'زكاة المال (ج.م)'},
          {key: 'zakat_fitr', labelAr: 'زكاة الفطر (ج.م)'},
          {key: 'sadaqah', labelAr: 'الصدقات (ج.م)'},
          {key: 'general', labelAr: 'عام (ج.م)'},
          {key: 'project_restricted', labelAr: 'مشروعات مخصصة (ج.م)'},
          {key: 'currentBalance', labelAr: 'الإجمالي (ج.م)'},
        ],
        rows: state.treasuryAccounts.map((acc) => ({
          name: acc.name,
          typeAr: acc.accountType === 'cash_vault' ? 'خزينة نقدية' : `حساب بنكي (${acc.bankName || 'بنك'})`,
          zakat_mal: acc.fundBalances.zakat_mal,
          zakat_fitr: acc.fundBalances.zakat_fitr,
          sadaqah: acc.fundBalances.sadaqah,
          general: acc.fundBalances.general,
          project_restricted: acc.fundBalances.project_restricted,
          currentBalance: acc.currentBalance,
        })),
      };
    } else if (reportType === 'donors') {
      const list = filterByDateRange(state.donations, (d) => d.donationDate, dateFrom, dateTo);
      const map = new Map<
        string,
        {donorName: string; phone: string; count: number; totalP: bigint; lastDate: string}
      >();
      for (const d of list) {
        const key = d.isAnonymous ? '__anonymous__' : d.donorName.trim().toLowerCase();
        const curr = map.get(key) || {
          donorName: d.donorName,
          phone: d.donorPhone || '—',
          count: 0,
          totalP: 0n,
          lastDate: d.donationDate,
        };
        curr.count += 1;
        if (d.category !== 'in_kind') {
          curr.totalP += parseMoneyToPiasters(d.amount);
        }
        if (d.donationDate > curr.lastDate) curr.lastDate = d.donationDate;
        map.set(key, curr);
      }
      const donorRows = Array.from(map.values());
      report = {
        reportType,
        titleAr: 'تقرير سجل المتبرعين',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي المتبرعين', value: String(donorRows.length)},
          {labelAr: 'إجمالي التبرعات المسجلة', value: String(list.length)},
        ],
        columns: [
          {key: 'donorName', labelAr: 'اسم المتبرع'},
          {key: 'phone', labelAr: 'الهاتف'},
          {key: 'count', labelAr: 'عدد التبرعات'},
          {key: 'total', labelAr: 'إجمالي القيمة (ج.م)'},
          {key: 'lastDate', labelAr: 'تاريخ آخر تبرع'},
        ],
        rows: donorRows.map((r) => ({
          donorName: r.donorName,
          phone: r.phone,
          count: r.count,
          total: formatPiastersToDecimal(r.totalP),
          lastDate: r.lastDate,
        })),
      };
    } else if (reportType === 'families') {
      const list = filterByDateRange(state.families, (f) => f.createdAt, dateFrom, dateTo);
      report = {
        reportType,
        titleAr: 'تقرير الأسر المستفيدة والبحث الاجتماعي',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي الأسر المسجلة', value: String(list.length)},
          {
            labelAr: 'الأسر المعتمدة',
            value: String(list.filter((f) => f.approvalStatus === 'approved').length),
          },
          {
            labelAr: 'إجمالي الأفراد',
            value: String(list.reduce((s, f) => s + f.membersCount, 0)),
          },
        ],
        columns: [
          {key: 'fileNumber', labelAr: 'رقم الملف'},
          {key: 'headOfHousehold', labelAr: 'رب الأسرة'},
          {key: 'nationalIdMasked', labelAr: 'الرقم القومي (محمي)'},
          {key: 'governorate', labelAr: 'المحافظة'},
          {key: 'membersCount', labelAr: 'الأفراد'},
          {key: 'approvalAr', labelAr: 'قرار الاعتماد'},
          {key: 'eligibilityAr', labelAr: 'الأهلية'},
          {key: 'monthlyAmount', labelAr: 'الدعم الشهري (ج.م)'},
        ],
        rows: list.map((f) => ({
          fileNumber: f.fileNumber,
          headOfHousehold: f.headOfHousehold,
          nationalIdMasked: f.nationalIdMasked,
          governorate: f.governorate,
          membersCount: f.membersCount,
          approvalAr: FAMILY_APPROVAL_LABELS_AR[f.approvalStatus],
          eligibilityAr: ELIGIBILITY_LABELS_AR[f.eligibilityStatus],
          monthlyAmount: f.monthlyAssistanceEnabled ? f.monthlyAssistanceAmount : '0.00',
        })),
      };
    } else if (reportType === 'pensions') {
      const activePlans = state.pensionPlans.filter((p) => p.status === 'active');
      const monthlyTotalP = activePlans.reduce(
        (acc, p) => acc + parseMoneyToPiasters(p.monthlyAmount),
        0n,
      );
      report = {
        reportType,
        titleAr: 'تقرير نظام معاشات الخير',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'عدد الأسر المستفيدة بالمعاش', value: String(activePlans.length)},
          {labelAr: 'إجمالي المعاشات الشهرية', value: `${formatPiastersToDecimal(monthlyTotalP)} ج.م`},
          {
            labelAr: 'إجمالي المعاشات السنوية',
            value: `${formatPiastersToDecimal(monthlyTotalP * 12n)} ج.م`,
          },
        ],
        columns: [
          {key: 'familyFileNumber', labelAr: 'رقم الملف'},
          {key: 'headOfHousehold', labelAr: 'رب الأسرة'},
          {key: 'monthlyAmount', labelAr: 'قيمة المعاش (ج.م)'},
          {key: 'startMonthKey', labelAr: 'بدء الاستحقاق'},
          {key: 'statusAr', labelAr: 'الحالة'},
          {key: 'fundAr', labelAr: 'الصندوق'},
          {key: 'approvedByName', labelAr: 'المعتمد'},
        ],
        rows: state.pensionPlans.map((p) => ({
          familyFileNumber: p.familyFileNumber,
          headOfHousehold: p.headOfHousehold,
          monthlyAmount: p.monthlyAmount,
          startMonthKey: p.startMonthKey,
          statusAr: PENSION_STATUS_LABELS_AR[p.status],
          fundAr: FUND_POOL_LABELS_AR[p.fundType],
          approvedByName: p.approvedByName,
        })),
      };
    } else if (reportType === 'assistances') {
      const aidTx = filterByDateRange(
        state.financialTransactions.filter((t) => t.txType === 'aid_disbursement'),
        (t) => t.txDate,
        dateFrom,
        dateTo,
      );
      const disb = filterByDateRange(
        state.monthlyDisbursements,
        (d) => d.recordedAt,
        dateFrom,
        dateTo,
      );
      const totalP =
        aidTx
          .filter((t) => t.workflowStatus === 'executed')
          .reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n) +
        disb.reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);

      report = {
        reportType,
        titleAr: 'تقرير المساعدات الخيرية المنفذة',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي قيمة المساعدات المنفذة', value: `${formatPiastersToDecimal(totalP)} ج.م`},
          {labelAr: 'عدد المساعدات النقدية والشهرية', value: String(aidTx.length + disb.length)},
        ],
        columns: [
          {key: 'date', labelAr: 'التاريخ'},
          {key: 'beneficiary', labelAr: 'المستفيد'},
          {key: 'kind', labelAr: 'نوع المساعدة'},
          {key: 'status', labelAr: 'الحالة'},
          {key: 'amount', labelAr: 'القيمة (ج.م)'},
        ],
        rows: [
          ...disb.map((d) => ({
            date: d.recordedAt.slice(0, 10),
            beneficiary: `${d.headOfHousehold} (${d.familyFileNumber})`,
            kind: `معاش / دعم شهري (${d.monthKey})`,
            status: 'تم الصرف',
            amount: d.amount,
          })),
          ...aidTx.map((t) => ({
            date: t.txDate,
            beneficiary: t.familyName || t.title,
            kind: FINANCIAL_PURPOSE_LABELS_AR[t.purposeCategory],
            status: WORKFLOW_STATUS_LABELS_AR[t.workflowStatus],
            amount: t.amount,
          })),
        ],
      };
    } else if (reportType === 'projects') {
      const rows = state.projects.map((p) => {
        const donP = state.donations
          .filter((d) => d.projectId === p.id && d.category !== 'in_kind')
          .reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
        const expP = state.financialTransactions
          .filter((t) => t.projectId === p.id && t.workflowStatus === 'executed')
          .reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n);
        return {
          code: p.code,
          name: p.name,
          categoryAr: PROJECT_CATEGORY_LABELS_AR[p.category],
          budget: p.budget,
          donations: formatPiastersToDecimal(donP),
          expenses: formatPiastersToDecimal(expP),
          balance: formatPiastersToDecimal(donP - expP),
          beneficiaries: p.beneficiaryFamilyIds.length,
          completion: `${p.completionPercent}%`,
        };
      });
      report = {
        reportType,
        titleAr: 'تقرير المشروعات الخيرية',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي المشروعات', value: String(state.projects.length)},
          {
            labelAr: 'المشروعات النشطة',
            value: String(state.projects.filter((p) => p.status === 'active').length),
          },
        ],
        columns: [
          {key: 'code', labelAr: 'كود المشروع'},
          {key: 'name', labelAr: 'اسم المشروع'},
          {key: 'categoryAr', labelAr: 'التصنيف'},
          {key: 'budget', labelAr: 'الميزانية (ج.م)'},
          {key: 'donations', labelAr: 'التبرعات (ج.م)'},
          {key: 'expenses', labelAr: 'المصروفات (ج.م)'},
          {key: 'balance', labelAr: 'المتبقي (ج.م)'},
          {key: 'beneficiaries', labelAr: 'المستفيدون'},
          {key: 'completion', labelAr: 'الإنجاز'},
        ],
        rows,
      };
    } else if (reportType === 'warehouse') {
      report = {
        reportType,
        titleAr: 'تقرير المخازن والتبرعات العينية',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي الأصناف المسجلة', value: String(state.warehouseItems.length)},
          {
            labelAr: 'أصناف منخفضة المخزون',
            value: String(
              state.warehouseItems.filter((i) => i.availableQty <= i.minStockAlert).length,
            ),
          },
        ],
        columns: [
          {key: 'itemCode', labelAr: 'كود الصنف'},
          {key: 'name', labelAr: 'اسم الصنف'},
          {key: 'categoryAr', labelAr: 'التصنيف'},
          {key: 'conditionAr', labelAr: 'الحالة'},
          {key: 'totalIn', labelAr: 'الوارد'},
          {key: 'totalOut', labelAr: 'المنصرف'},
          {key: 'availableQty', labelAr: 'المتبقي'},
          {key: 'unit', labelAr: 'الوحدة'},
        ],
        rows: state.warehouseItems.map((i) => ({
          itemCode: i.itemCode,
          name: i.name,
          categoryAr: WAREHOUSE_CATEGORY_LABELS_AR[i.category],
          conditionAr: WAREHOUSE_CONDITION_LABELS_AR[i.condition],
          totalIn: i.totalIn,
          totalOut: i.totalOut,
          availableQty: i.availableQty,
          unit: i.unit,
        })),
      };
    } else if (reportType === 'volunteers') {
      report = {
        reportType,
        titleAr: 'تقرير المتطوعين والمشاركات',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'إجمالي المتطوعين', value: String(state.volunteers.length)},
          {
            labelAr: 'المتطوعون النشطون',
            value: String(state.volunteers.filter((v) => v.isActive).length),
          },
        ],
        columns: [
          {key: 'fullName', labelAr: 'اسم المتطوع'},
          {key: 'teamName', labelAr: 'الفريق'},
          {key: 'skills', labelAr: 'المهارات'},
          {key: 'joinedAt', labelAr: 'تاريخ الانضمام'},
          {key: 'rating', labelAr: 'التقييم (من ٥)'},
        ],
        rows: state.volunteers.map((v) => ({
          fullName: v.fullName,
          teamName: v.teamName || 'عام',
          skills: v.skills.join('، ') || '—',
          joinedAt: v.joinedAt,
          rating: v.rating > 0 ? `${v.rating} / 5` : 'لم يُقيّم بعد',
        })),
      };
    } else {
      // performance: monthly & annual performance breakdown
      const monthsSet = new Set<string>();
      for (const d of state.donations) monthsSet.add(d.monthKey);
      for (const m of state.monthlyDisbursements) monthsSet.add(m.monthKey);
      for (const t of state.financialTransactions) monthsSet.add(t.monthKey);
      const sortedMonths = Array.from(monthsSet).sort().reverse();

      const perfRows = sortedMonths.map((mk) => {
        const donP = state.donations
          .filter((d) => d.monthKey === mk && d.category !== 'in_kind')
          .reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n);
        const expP =
          state.monthlyDisbursements
            .filter((d) => d.monthKey === mk)
            .reduce((acc, d) => acc + parseMoneyToPiasters(d.amount), 0n) +
          state.financialTransactions
            .filter(
              (t) =>
                t.monthKey === mk &&
                t.workflowStatus === 'executed' &&
                (t.txType === 'expense' || t.txType === 'aid_disbursement'),
            )
            .reduce((acc, t) => acc + parseMoneyToPiasters(t.amount), 0n);
        return {
          monthKey: mk,
          donations: formatPiastersToDecimal(donP),
          expenses: formatPiastersToDecimal(expP),
          net: formatPiastersToDecimal(donP - expP),
          donationsCount: state.donations.filter((d) => d.monthKey === mk).length,
          disbursementsCount: state.monthlyDisbursements.filter((d) => d.monthKey === mk).length,
        };
      });

      report = {
        reportType: 'performance',
        titleAr: 'تقرير الأداء المالي والتشغيلي الشهري والسنوي',
        generatedAt,
        dateFrom,
        dateTo,
        summaryMetrics: [
          {labelAr: 'الأشهر المسجلة', value: String(perfRows.length)},
          {labelAr: 'الأسر المعتمدة', value: String(state.families.filter((f) => f.approvalStatus === 'approved').length)},
          {labelAr: 'المشروعات الخيرية', value: String(state.projects.length)},
        ],
        columns: [
          {key: 'monthKey', labelAr: 'الشهر'},
          {key: 'donations', labelAr: 'إجمالي التبرعات (ج.م)'},
          {key: 'expenses', labelAr: 'إجمالي المصروفات (ج.م)'},
          {key: 'net', labelAr: 'صافي الفائض / العجز (ج.م)'},
          {key: 'donationsCount', labelAr: 'عدد التبرعات'},
          {key: 'disbursementsCount', labelAr: 'معاشات مصروفة'},
        ],
        rows: perfRows,
      };
    }

    res.json(report);
  },
);
