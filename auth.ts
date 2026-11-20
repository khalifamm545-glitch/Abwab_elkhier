export type UserRole = 'president' | 'manager';

export interface UserGranularPermissions {
  canViewData: boolean;
  canAddData: boolean;
  canEditData: boolean;
  canDeleteData: boolean;
  canApproveTransactions: boolean;
  canExecuteFinancial: boolean;
  canExportReports: boolean;
}

export interface ManagerModulePermissions {
  families: boolean;
  pensions: boolean;
  donations: boolean;
  finance: boolean;
  projects: boolean;
  warehouse: boolean;
  volunteers: boolean;
  activities: boolean;
  reports: boolean;
}

export interface BoardAuthorizations {
  canViewActivities: boolean;
  canViewTasks: boolean;
  canViewExecutiveSummary: boolean;
  canViewFamiliesSummary: boolean;
}

export interface RolePermissionMatrix extends UserGranularPermissions {
  modulePermissions: ManagerModulePermissions;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canManagePasswordResets: boolean;
  canViewSecurityLogs: boolean;
  canManageSettings: boolean;
  canCreateActivities: boolean;
  canViewAllActivities: boolean;
  canManageAssignedActivityOnly: boolean;
  canViewAuthorizedBoardData: boolean;
  canParticipateInTasks: boolean;
  canCreateTasks: boolean;
  canViewFamiliesStats: boolean;
  canManageFamilies: boolean;
  canViewMonthlyAssistanceStats: boolean;
  canRecordMonthlyAssistance: boolean;
  canViewFinancialGovernance: boolean;
  canRecordDonations: boolean;
  canViewTreasury: boolean;
  canManageWarehouse: boolean;
  canManageProjects: boolean;
  canManageVolunteers: boolean;
  canManageBoardRegistry: boolean;
  statsScopeLabelAr: string;
  summaryAr: string;
  capabilitiesAr: string[];
}

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  boardPosition: string;
  membershipStatus: 'active' | 'inactive' | 'honorary';
  assignedActivityId: string | null;
  assignedActivityName: string | null;
  boardAuthorizations: BoardAuthorizations;
  granularPermissions: UserGranularPermissions;
  modulePermissions: ManagerModulePermissions;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDocumentRef {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  entityType: 'family' | 'project' | 'organization';
  entityId: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface CharityActivity {
  id: string;
  name: string;
  description: string;
  managerUserId: string | null;
  managerName: string | null;
  status: 'active' | 'planned' | 'completed';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTask {
  id: string;
  activityId: string;
  activityName: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'completed';
  visibleToBoard: boolean;
  openForVolunteers: boolean;
  assignedVolunteerIds: string[];
  participantIds: string[];
  participantNames: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export type FamilyEligibilityStatus =
  | 'priority'
  | 'eligible'
  | 'pending_review'
  | 'suspended';

export type FamilyApprovalStatus = 'approved' | 'rejected' | 'pending_review';

export type FamilyMaritalStatus =
  | 'married'
  | 'widowed'
  | 'divorced'
  | 'single'
  | 'elderly_care';

export type FamilyEconomicStatus =
  | 'no_income'
  | 'irregular_income'
  | 'low_income'
  | 'urgent_medical_need';

export type AssistanceSupportType =
  | 'monthly_pension'
  | 'food_support'
  | 'medical_support'
  | 'orphan_sponsorship';

export interface BeneficiaryFamilyRecord {
  id: string;
  fileNumber: string;
  headOfHousehold: string;
  nationalIdMasked: string;
  hasNationalId: boolean;
  governorate: string;
  address: string;
  phone: string;
  membersCount: number;
  maritalStatus: FamilyMaritalStatus;
  economicStatus: FamilyEconomicStatus;
  incomeSource: string;
  eligibilityStatus: FamilyEligibilityStatus;
  approvalStatus: FamilyApprovalStatus;
  socialResearchResult: string;
  socialResearchDate: string | null;
  socialResearchByName: string | null;
  supportType: AssistanceSupportType;
  monthlyAssistanceEnabled: boolean;
  monthlyAssistanceAmount: string; // Exact decimal EGP string e.g. "1250.00"
  activityId: string | null;
  activityName: string | null;
  notes: string;
  attachments: StoredDocumentRef[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyAssistanceDisbursement {
  id: string;
  familyId: string;
  familyFileNumber: string;
  headOfHousehold: string;
  activityId: string | null;
  monthKey: string; // YYYY-MM
  amount: string; // Exact decimal EGP string
  supportType: AssistanceSupportType;
  proofReference: string;
  treasuryAccountId: string | null;
  fundType: FundPoolType;
  notes: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export type PensionStatus = 'active' | 'paused' | 'stopped';

export interface CharityPensionPlan {
  id: string;
  familyId: string;
  familyFileNumber: string;
  headOfHousehold: string;
  activityId: string | null;
  monthlyAmount: string; // Exact decimal EGP
  startMonthKey: string; // YYYY-MM
  status: PensionStatus;
  fundType: FundPoolType;
  notes: string;
  approvedBy: string;
  approvedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PensionMonthRow {
  plan: CharityPensionPlan;
  monthKey: string;
  paidDisbursement: MonthlyAssistanceDisbursement | null;
  arrearsMonthKeys: string[];
  arrearsTotal: string;
}

export interface FamiliesStatisticsSummary {
  scopeLabelAr: string;
  totalFamilies: number;
  approvedFamilies: number;
  totalIndividuals: number;
  enrolledMonthlyCount: number;
  byEligibility: {
    priority: number;
    eligible: number;
    pending_review: number;
    suspended: number;
  };
}

export interface MonthlyAssistanceSummary {
  scopeLabelAr: string;
  currency: 'EGP';
  currentMonthKey: string;
  scheduledMonthlyTotal: string;
  disbursedCurrentMonthTotal: string;
  disbursedCurrentMonthCount: number;
  averagePerEnrolledFamily: string;
  bySupportType: Array<{
    supportType: AssistanceSupportType;
    labelAr: string;
    familiesCount: number;
    monthlyTotal: string;
  }>;
}

export type DonationCategory =
  | 'monthly_subscription'
  | 'sadaqah'
  | 'zakat'
  | 'zakat_fitr'
  | 'general_donation'
  | 'campaign'
  | 'in_kind';

export type DonationPaymentMethod = 'cash' | 'bank_transfer' | 'wallet' | 'instapay' | 'in_kind';

export type FundPoolType =
  | 'zakat_mal'
  | 'zakat_fitr'
  | 'sadaqah'
  | 'general'
  | 'project_restricted';

export interface DonationRecord {
  id: string;
  receiptNumber: string;
  donorName: string;
  donorPhone: string;
  isAnonymous: boolean;
  category: DonationCategory;
  fundType: FundPoolType;
  paymentMethod: DonationPaymentMethod;
  amount: string; // Exact decimal EGP string e.g. "2500.00"
  donationDate: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  treasuryAccountId: string | null;
  treasuryAccountName: string | null;
  projectId: string | null;
  projectName: string | null;
  activityId: string | null;
  activityName: string | null;
  inKindDescription: string;
  notes: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export type TreasuryAccountType = 'cash_vault' | 'bank_account';

export interface TreasuryAccount {
  id: string;
  name: string;
  accountType: TreasuryAccountType;
  bankName: string;
  accountNumberMasked: string;
  isActive: boolean;
  currentBalance: string; // Exact EGP
  fundBalances: Record<FundPoolType, string>;
  createdAt: string;
  updatedAt: string;
}

export type FinancialTxType = 'expense' | 'aid_disbursement' | 'transfer' | 'reversal';

export type FinancialPurposeCategory =
  | 'zakat_beneficiaries'
  | 'zakat_fitr_beneficiaries'
  | 'charity_aid'
  | 'project_expense'
  | 'medical_aid'
  | 'marriage_aid'
  | 'debt_relief'
  | 'food_aid'
  | 'administrative'
  | 'account_transfer';

export type FinancialWorkflowStatus = 'recorded' | 'approved' | 'executed' | 'rejected' | 'reversed';

export interface FinancialTransaction {
  id: string;
  entryNumber: string; // FIN-YYYY-0001
  txType: FinancialTxType;
  title: string;
  description: string;
  amount: string; // Exact EGP
  txDate: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  fundType: FundPoolType;
  purposeCategory: FinancialPurposeCategory;
  sourceAccountId: string;
  sourceAccountName: string;
  destinationAccountId: string | null;
  destinationAccountName: string | null;
  projectId: string | null;
  projectName: string | null;
  familyId: string | null;
  familyName: string | null;
  workflowStatus: FinancialWorkflowStatus;
  // Mandatory 3-step segregation of duties audit trail
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNotes: string;
  executedBy: string | null;
  executedByName: string | null;
  executedAt: string | null;
  executionReference: string;
  reversedBy: string | null;
  reversedByName: string | null;
  reversedAt: string | null;
  reversalReason: string;
  reversesTransactionId: string | null;
}

export type CharityProjectCategory =
  | 'charity_pensions'
  | 'marriage_aid'
  | 'medical_aid'
  | 'debt_relief'
  | 'food_aid'
  | 'clothing_initiative'
  | 'medical_devices'
  | 'in_kind_program'
  | 'other_project';

export interface CharityProject {
  id: string;
  code: string; // PRJ-YYYY-001
  name: string;
  category: CharityProjectCategory;
  description: string;
  budget: string; // Exact EGP
  status: 'active' | 'planned' | 'completed' | 'paused';
  completionPercent: number;
  beneficiaryFamilyIds: string[];
  finalReport: string;
  attachments: StoredDocumentRef[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharityProjectWithMetrics extends CharityProject {
  totalDonations: string;
  totalExpenses: string;
  remainingBalance: string;
  beneficiariesCount: number;
}

export type WarehouseCategory =
  | 'clothing'
  | 'electrical_appliances'
  | 'medical_devices'
  | 'food_supplies'
  | 'furniture'
  | 'other';

export type WarehouseCondition = 'new' | 'used_good' | 'needs_repair';

export interface WarehouseItem {
  id: string;
  itemCode: string; // WH-0001
  name: string;
  category: WarehouseCategory;
  condition: WarehouseCondition;
  unit: string;
  minStockAlert: number;
  totalIn: number;
  totalOut: number;
  availableQty: number;
  receivedDate: string;
  donationSource: string;
  notes: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseMovement {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  movementType: 'in' | 'out';
  quantity: number;
  movementDate: string;
  sourceOrBeneficiary: string;
  beneficiaryFamilyId: string | null;
  beneficiaryFamilyName: string | null;
  notes: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export interface VolunteerProfile {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string;
  address: string;
  skills: string[];
  teamName: string;
  joinedAt: string;
  rating: number; // 0-5
  evaluationNotes: string;
  isActive: boolean;
  participatedActivitiesCount: number;
  assignedTasksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type:
    | 'pension_due'
    | 'family_pending'
    | 'approval_needed'
    | 'execution_needed'
    | 'low_stock'
    | 'task_overdue'
    | 'new_donation';
  severity: 'info' | 'warning' | 'urgent';
  titleAr: string;
  messageAr: string;
  targetTab: string;
  createdAt: string;
}

export interface OrganizationSettings {
  nameAr: string;
  sloganAr: string;
  secondarySloganAr: string;
  registrationNumber: string;
  phone: string;
  email: string;
  address: string;
  currency: 'EGP';
  customLogoUrl: string | null;
  receiptPrefix: string;
  receiptFooterAr: string;
  authorizedSignerName: string;
  customDonationTypes: string[];
  customExpenseTypes: string[];
  customAidTypes: string[];
  updatedAt: string;
}

export interface MonthlyFinancialPoint {
  monthKey: string;
  shortLabelAr: string;
  fullLabelAr: string;
  donationsTotal: string;
  donationsCount: number;
  disbursementsTotal: string;
  disbursementsCount: number;
  netBalance: string;
}

export interface FinancialGovernanceSummary {
  scopeLabelAr: string;
  currency: 'EGP';
  currentMonthKey: string;
  totalDonations12M: string;
  totalDisbursements12M: string;
  currentMonthDonations: string;
  previousMonthDonations: string;
  totalDonationRecordsCount: number;
  monthlySeries: MonthlyFinancialPoint[];
  byCategory: Array<{
    category: DonationCategory;
    labelAr: string;
    count: number;
    total: string;
  }>;
}

export interface PasswordResetRequest {
  id: string;
  userId: string;
  userFullName: string;
  username: string;
  email: string;
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface SecurityAuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: UserRole | 'anonymous';
  actionCode: string;
  summaryAr: string;
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  permissions: RolePermissionMatrix;
}

export type DashboardPeriodFilter = 'month' | 'quarter' | 'year' | 'all';

export interface DashboardOverviewData {
  role: UserRole;
  period: DashboardPeriodFilter;
  statsScopeLabelAr: string;
  executiveKpis: {
    totalDonations: string | null;
    totalExpenses: string | null;
    currentTreasuryBalance: string | null;
    beneficiaryFamiliesCount: number | null;
    registeredFamiliesCount: number | null;
    volunteersCount: number | null;
    donationsCountInPeriod: number | null;
    executedAssistancesCount: number | null;
    pendingObligationsTotal: string | null;
    pendingApprovalsCount: number | null;
  };
  stats: {
    totalUsers: number | null;
    activeUsers: number | null;
    pendingPasswordResets: number | null;
    visibleActivitiesCount: number;
    visibleTasksCount: number;
    myParticipationsCount: number;
  };
  familiesSummary: FamiliesStatisticsSummary | null;
  monthlyAssistanceSummary: MonthlyAssistanceSummary | null;
  financialGovernance: FinancialGovernanceSummary | null;
  recentFinancialTransactions: FinancialTransaction[];
  recentActivities: CharityActivity[];
  assignedActivity: CharityActivity | null;
  availableActivities: Array<{id: string; name: string}>;
  recentLogs: SecurityAuditEntry[];
}

export interface FamilyAssistanceHistory {
  family: BeneficiaryFamilyRecord;
  pensionPlans: CharityPensionPlan[];
  pensionDisbursements: MonthlyAssistanceDisbursement[];
  financialAidTransactions: FinancialTransaction[];
  warehouseDistributions: WarehouseMovement[];
}

export type ReportTypeId =
  | 'revenues'
  | 'expenses'
  | 'treasury'
  | 'donations'
  | 'donors'
  | 'families'
  | 'pensions'
  | 'assistances'
  | 'projects'
  | 'warehouse'
  | 'volunteers'
  | 'performance';

export interface GeneratedReportResponse {
  reportType: ReportTypeId;
  titleAr: string;
  generatedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  summaryMetrics: Array<{labelAr: string; value: string}>;
  columns: Array<{key: string; labelAr: string}>;
  rows: Array<Record<string, string | number>>;
}

// =============================================================================
// ARABIC LABEL DICTIONARIES
// =============================================================================

export const ELIGIBILITY_LABELS_AR: Record<FamilyEligibilityStatus, string> = {
  priority: 'أولوية قصوى',
  eligible: 'مستحقة',
  pending_review: 'قيد المراجعة',
  suspended: 'موقوفة مؤقتاً',
};

export const FAMILY_APPROVAL_LABELS_AR: Record<FamilyApprovalStatus, string> = {
  approved: 'معتمدة للاستحقاق',
  pending_review: 'تحت المراجعة الاجتماعية',
  rejected: 'مرفوضة',
};

export const MARITAL_STATUS_LABELS_AR: Record<FamilyMaritalStatus, string> = {
  married: 'متزوج ويعول',
  widowed: 'أرملة تعول',
  divorced: 'مطلقة تعول',
  single: 'أعزب / فرد مستقل',
  elderly_care: 'مسن / رعاية خاصة',
};

export const ECONOMIC_STATUS_LABELS_AR: Record<FamilyEconomicStatus, string> = {
  no_income: 'معدوم الدخل',
  irregular_income: 'دخل غير ثابت / عمالة يومية',
  low_income: 'دخل محدود لا يكفي الاحتياجات',
  urgent_medical_need: 'ظرف طبي طارئ وعجز عن العمل',
};

export const SUPPORT_TYPE_LABELS_AR: Record<AssistanceSupportType, string> = {
  monthly_pension: 'معاش خير شهري',
  food_support: 'دعم غذائي شهري',
  medical_support: 'مساعدة علاجية شهرية',
  orphan_sponsorship: 'كفالة أيتام شهرية',
};

export const PENSION_STATUS_LABELS_AR: Record<PensionStatus, string> = {
  active: 'ساري',
  paused: 'موقوف مؤقتاً',
  stopped: 'منتهي / متوقف',
};

export const DONATION_CATEGORY_LABELS_AR: Record<DonationCategory, string> = {
  monthly_subscription: 'التبرعات الشهرية',
  sadaqah: 'الصدقات',
  zakat: 'زكاة المال',
  zakat_fitr: 'زكاة الفطر',
  general_donation: 'التبرعات العامة',
  campaign: 'التبرعات المخصصة لمشروع',
  in_kind: 'التبرعات العينية',
};

export const PAYMENT_METHOD_LABELS_AR: Record<DonationPaymentMethod, string> = {
  cash: 'نقدي بمقر الجمعية',
  bank_transfer: 'تحويل بنكي',
  wallet: 'محفظة إلكترونية',
  instapay: 'إنستا باي',
  in_kind: 'تسليم عيني بالمخزن',
};

export const FUND_POOL_LABELS_AR: Record<FundPoolType, string> = {
  zakat_mal: 'صندوق زكاة المال',
  zakat_fitr: 'صندوق زكاة الفطر',
  sadaqah: 'صندوق الصدقات',
  general: 'صندوق التبرعات العامة',
  project_restricted: 'صندوق التبرعات المخصصة للمشروعات',
};

export const FINANCIAL_PURPOSE_LABELS_AR: Record<FinancialPurposeCategory, string> = {
  zakat_beneficiaries: 'مصارف زكاة المال الشرعية',
  zakat_fitr_beneficiaries: 'مصارف زكاة الفطر الشرعية',
  charity_aid: 'مساعدات خيرية للأسر',
  project_expense: 'تنفيذ مشروع خيري',
  medical_aid: 'مساعدات وعلاج طبي',
  marriage_aid: 'مساعدات تيسير الزواج',
  debt_relief: 'سداد ديون غارمين',
  food_aid: 'مساعدات وإطعام غذائي',
  administrative: 'مصروفات إدارية وتشغيلية',
  account_transfer: 'تحويل بين الحسابات',
};

export const WORKFLOW_STATUS_LABELS_AR: Record<FinancialWorkflowStatus, string> = {
  recorded: 'مسجلة (بانتظار الاعتماد)',
  approved: 'معتمدة (بانتظار تنفيذ الصرف)',
  executed: 'تم تنفيذ الصرف',
  rejected: 'مرفوضة',
  reversed: 'تم عكسها بقيد تصحيحي',
};

export const PROJECT_CATEGORY_LABELS_AR: Record<CharityProjectCategory, string> = {
  charity_pensions: 'معاشات الخير',
  marriage_aid: 'مساعدات الزواج',
  medical_aid: 'المساعدات الطبية',
  debt_relief: 'سداد الديون',
  food_aid: 'المساعدات الغذائية',
  clothing_initiative: 'مبادرات الملابس',
  medical_devices: 'توفير الأجهزة والمستلزمات الطبية',
  in_kind_program: 'التبرعات العينية',
  other_project: 'مشروعات خيرية أخرى',
};

export const WAREHOUSE_CATEGORY_LABELS_AR: Record<WarehouseCategory, string> = {
  clothing: 'ملابس ومفروشات',
  electrical_appliances: 'أجهزة كهربائية',
  medical_devices: 'أجهزة ومستلزمات طبية',
  food_supplies: 'أغذية ومواد تموينية',
  furniture: 'أثاث منزلي',
  other: 'أصناف عينية أخرى',
};

export const WAREHOUSE_CONDITION_LABELS_AR: Record<WarehouseCondition, string> = {
  new: 'جديد',
  used_good: 'مستعمل بحالة جيدة',
  needs_repair: 'يحتاج صيانة',
};

export const GRANULAR_PERM_LABELS_AR: Record<keyof UserGranularPermissions, string> = {
  canViewData: 'العرض (عرض البيانات)',
  canAddData: 'الإضافة (إضافة البيانات)',
  canEditData: 'التعديل (تعديل البيانات)',
  canDeleteData: 'الحذف (حذف / تصحيح البيانات)',
  canApproveTransactions: 'الاعتماد والموافقة (البحث الاجتماعي والملفات)',
  canExecuteFinancial: 'تنفيذ المعاملات المالية والصرف',
  canExportReports: 'استخراج وتصدير التقارير',
};

export const MODULE_PERM_LABELS_AR: Record<keyof ManagerModulePermissions, string> = {
  families: 'الأسر المستفيدة والبحث الاجتماعي',
  pensions: 'نظام معاشات الخير الشهرية',
  donations: 'التبرعات وسجل المتبرعين',
  finance: 'الإدارة المالية والخزينة',
  projects: 'المشروعات الخيرية',
  warehouse: 'المخازن والتبرعات العينية',
  volunteers: 'إدارة المتطوعين والمهام',
  activities: 'الأنشطة التشغيلية',
  reports: 'التقارير والإحصائيات',
};

export const ROLE_META: Record<
  UserRole,
  {
    labelAr: string;
    shortDescAr: string;
    capabilitiesAr: string[];
  }
> = {
  president: {
    labelAr: 'رئيس مجلس الإدارة',
    shortDescAr:
      'الحساب القيادي الأساسي والوحيد للجمعية — صلاحيات كاملة لإنشاء حسابات المديرين وتحديد صلاحياتهم وتعديلها أو إيقافها أو حذفها.',
    capabilitiesAr: [
      'المسؤول الوحيد عن إنشاء حسابات المديرين وتحديد صلاحيات كل مدير بشكل مستقل أو تعديلها أو تعطيلها أو حذفها',
      'الإشراف الكامل على الأسر ومعاشات الخير والتبرعات والخزينة والمشروعات والمخازن والمتطوعين',
      'الاعتماد الحصري لطلبات الصرف المالي وخطط الكفالات الشهرية وإدارة إعدادات الجمعية والنسخ الاحتياطي',
      'مراجعة سجل الأمان والتدقيق الشامل واستخراج جميع التقارير الرسمية بصيغتي PDF وExcel',
    ],
  },
  manager: {
    labelAr: 'مدير',
    shortDescAr:
      'حساب إداري مستقل يُنشأ حصرياً عبر رئيس مجلس الإدارة، وتُفعّل أقسامه وصلاحياته التفصيلية حسب ما يقرره الرئيس فقط.',
    capabilitiesAr: [
      'لا يمتلك أي صلاحيات تلقائية قبل تحديدها واعتمادها من رئيس مجلس الإدارة',
      'إدارة الأقسام المصرّح بها فقط وفق الصلاحيات الممنوحة (العرض، الإضافة، التعديل، الحذف، الاعتماد التشغيلي، التنفيذ، التقارير)',
      'محمي خادمياً ضد الوصول إلى أي قسم غير مصرّح به أو تعديل صلاحيات نفسه أو غيره أو المساس بحساب رئيس مجلس الإدارة',
    ],
  },
};
