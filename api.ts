import type {
  ActivityTask,
  AppNotification,
  AssistanceSupportType,
  AuthSession,
  AuthUser,
  BeneficiaryFamilyRecord,
  BoardAuthorizations,
  CharityActivity,
  CharityPensionPlan,
  CharityProjectCategory,
  CharityProjectWithMetrics,
  DashboardOverviewData,
  DashboardPeriodFilter,
  DonationCategory,
  DonationPaymentMethod,
  DonationRecord,
  FamilyApprovalStatus,
  FamilyAssistanceHistory,
  FamilyEconomicStatus,
  FamilyEligibilityStatus,
  FamilyMaritalStatus,
  FinancialPurposeCategory,
  FinancialTransaction,
  FinancialTxType,
  FundPoolType,
  GeneratedReportResponse,
  ManagerModulePermissions,
  MonthlyAssistanceDisbursement,
  OrganizationSettings,
  PasswordResetRequest,
  PensionMonthRow,
  PensionStatus,
  ReportTypeId,
  SecurityAuditEntry,
  StoredDocumentRef,
  TreasuryAccount,
  TreasuryAccountType,
  UserGranularPermissions,
  VolunteerProfile,
  WarehouseCategory,
  WarehouseCondition,
  WarehouseItem,
  WarehouseMovement,
} from '../types/auth';

const TOKEN_STORAGE_KEY = 'abwab_auth_token';

let inMemoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const saved =
      window.localStorage.getItem(TOKEN_STORAGE_KEY) ||
      window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) {
      inMemoryToken = saved;
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

export function setStoredToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function getPrivateFileUrl(docId: string): string {
  const token = getStoredToken();
  return token ? `/api/files/${docId}?token=${encodeURIComponent(token)}` : `/api/files/${docId}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(
      'لا يوجد اتصال بالإنترنت حالياً. لا يُسمح بتنفيذ العمليات المالية أو الإدارية دون اتصال حفاظاً على سلامة البيانات.',
      0,
      'OFFLINE_BLOCKED',
    );
  }

  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      cache: 'no-store',
      headers,
    });
  } catch {
    throw new ApiError(
      'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
      0,
      'NETWORK_ERROR',
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') {
      setStoredToken(null);
    }
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'تعذر تنفيذ الطلب. يرجى المحاولة مجدداً.',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }
  return data as T;
}

export interface DonorSummaryRow {
  donorName: string;
  donorPhone: string;
  isAnonymous: boolean;
  donationsCount: number;
  totalMonetary: string;
  inKindCount: number;
  lastDonationDate: string;
}

export interface PensionsOverviewResponse {
  monthKey: string;
  currentMonthKey: string;
  rows: PensionMonthRow[];
  summary: {
    activeCount: number;
    pausedCount: number;
    stoppedCount: number;
    monthlyTotal: string;
    annualTotal: string;
    paidForMonthTotal: string;
    paidForMonthCount: number;
    totalArrearsAmount: string;
    arrearsPlansCount: number;
  };
  eligibleFamilies: BeneficiaryFamilyRecord[];
  treasuryAccounts: TreasuryAccount[];
}

export interface FinanceOverviewResponse {
  accounts: TreasuryAccount[];
  grandTotalBalance: string;
  fundTotals: Record<FundPoolType, string>;
  transactions: FinancialTransaction[];
  projects: Array<{id: string; code: string; name: string}>;
  families: Array<{id: string; fileNumber: string; headOfHousehold: string}>;
}

export const api = {
  // Auth
  getAuthStatus: () => request<{hasPresident: boolean; hasChairman?: boolean}>('/api/auth/status'),

  bootstrapPresident: (payload: {
    fullName: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  }) =>
    request<{token: string; session: AuthSession}>('/api/auth/bootstrap-president', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: {identifier: string; password: string}) =>
    request<{token: string; session: AuthSession}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => request<AuthSession>('/api/auth/me'),

  logout: () =>
    request<{success: boolean}>('/api/auth/logout', {
      method: 'POST',
    }),

  forgotPassword: (identifier: string) =>
    request<{message: string}>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({identifier}),
    }),

  resetPassword: (payload: {identifier: string; code: string; newPassword: string}) =>
    request<{message: string}>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changePassword: async (payload: {currentPassword: string; newPassword: string}) => {
    const res = await request<{success: boolean; token?: string; session?: AuthSession}>(
      '/api/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  // Dashboard Overview
  getOverview: (period: DashboardPeriodFilter = 'all') =>
    request<DashboardOverviewData>(`/api/dashboard/overview?period=${encodeURIComponent(period)}`),

  // Users & Granular/Module Permissions (President Only)
  getAdminUsers: () =>
    request<{
      users: AuthUser[];
      activities: CharityActivity[];
      passwordResetRequests: PasswordResetRequest[];
    }>('/api/admin/users'),

  createAdminUser: (payload: {
    fullName: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
    role: 'manager';
    boardPosition?: string;
    membershipStatus?: 'active' | 'inactive' | 'honorary';
    granularPermissions?: Partial<UserGranularPermissions>;
    modulePermissions?: Partial<ManagerModulePermissions>;
  }) =>
    request<{user: AuthUser}>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminUser: (
    userId: string,
    payload: {
      fullName?: string;
      email?: string;
      phone?: string;
      boardPosition?: string;
      membershipStatus?: 'active' | 'inactive' | 'honorary';
      isActive?: boolean;
      boardAuthorizations?: BoardAuthorizations;
      granularPermissions?: Partial<UserGranularPermissions>;
      modulePermissions?: Partial<ManagerModulePermissions>;
    },
  ) =>
    request<{user: AuthUser}>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  resetManagerTempPassword: (userId: string, temporaryPassword: string) =>
    request<{success: boolean; user: AuthUser}>(`/api/admin/users/${userId}/reset-temp-password`, {
      method: 'POST',
      body: JSON.stringify({temporaryPassword}),
    }),

  deleteAdminUser: (userId: string) =>
    request<{success: boolean; deletedUserId: string}>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  // Activities & Tasks
  getActivities: () =>
    request<{
      activities: CharityActivity[];
      managers: Array<{id: string; fullName: string; username: string}>;
    }>('/api/activities'),

  createActivity: (payload: {
    name: string;
    description: string;
    managerUserId?: string | null;
    status?: 'active' | 'planned' | 'completed';
  }) =>
    request<{activity: CharityActivity}>('/api/activities', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateActivity: (
    activityId: string,
    payload: {
      name?: string;
      description?: string;
      status?: 'active' | 'planned' | 'completed';
      managerUserId?: string | null;
    },
  ) =>
    request<{activity: CharityActivity}>(`/api/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getTasks: () => request<{tasks: ActivityTask[]}>('/api/tasks'),

  createTask: (payload: {
    activityId: string;
    title: string;
    description: string;
    dueDate?: string | null;
    visibleToBoard?: boolean;
    openForVolunteers?: boolean;
  }) =>
    request<{task: ActivityTask}>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),


  updateTaskStatus: (taskId: string, status: 'open' | 'in_progress' | 'completed') =>
    request<{task: ActivityTask}>(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status}),
    }),

  // Audit Log
  getSecurityLogs: () => request<{logs: SecurityAuditEntry[]}>('/api/security/logs'),

  // Beneficiary Families
  getFamilies: (params?: {search?: string; eligibility?: string; approval?: string}) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.eligibility && params.eligibility !== 'all') qs.set('eligibility', params.eligibility);
    if (params?.approval && params.approval !== 'all') qs.set('approval', params.approval);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{
      families: BeneficiaryFamilyRecord[];
      disbursements: MonthlyAssistanceDisbursement[];
      activities: CharityActivity[];
    }>(`/api/families${suffix}`);
  },

  createFamily: (payload: {
    headOfHousehold: string;
    nationalId?: string;
    governorate: string;
    address?: string;
    phone: string;
    membersCount: number;
    maritalStatus?: FamilyMaritalStatus;
    economicStatus?: FamilyEconomicStatus;
    incomeSource?: string;
    eligibilityStatus: FamilyEligibilityStatus;
    approvalStatus?: FamilyApprovalStatus;
    supportType: AssistanceSupportType;
    monthlyAssistanceEnabled: boolean;
    monthlyAssistanceAmount: string;
    activityId?: string | null;
    notes?: string;
  }) =>
    request<{family: BeneficiaryFamilyRecord}>('/api/families', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateFamily: (
    familyId: string,
    payload: {
      headOfHousehold?: string;
      nationalId?: string;
      governorate?: string;
      address?: string;
      phone?: string;
      membersCount?: number;
      maritalStatus?: FamilyMaritalStatus;
      economicStatus?: FamilyEconomicStatus;
      incomeSource?: string;
      eligibilityStatus?: FamilyEligibilityStatus;
      supportType?: AssistanceSupportType;
      monthlyAssistanceEnabled?: boolean;
      monthlyAssistanceAmount?: string;
      activityId?: string | null;
      notes?: string;
    },
  ) =>
    request<{family: BeneficiaryFamilyRecord}>(`/api/families/${familyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteFamily: (familyId: string) =>
    request<{success: boolean}>(`/api/families/${familyId}`, {method: 'DELETE'}),

  revealFamilyNationalId: (familyId: string) =>
    request<{nationalId: string}>(`/api/families/${familyId}/national-id`),

  submitSocialResearch: (
    familyId: string,
    payload: {
      socialResearchResult: string;
      approvalStatus: FamilyApprovalStatus;
      eligibilityStatus?: FamilyEligibilityStatus;
    },
  ) =>
    request<{family: BeneficiaryFamilyRecord}>(`/api/families/${familyId}/social-research`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getFamilyHistory: (familyId: string) =>
    request<FamilyAssistanceHistory>(`/api/families/${familyId}/history`),

  uploadFamilyAttachment: (
    familyId: string,
    payload: {fileName: string; mimeType: string; base64Data: string},
  ) =>
    request<{document: StoredDocumentRef; family: BeneficiaryFamilyRecord}>(
      `/api/families/${familyId}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  // Charity Pensions (معاشات الخير)
  getPensions: (monthKey?: string) =>
    request<PensionsOverviewResponse>(
      monthKey ? `/api/pensions?month=${encodeURIComponent(monthKey)}` : '/api/pensions',
    ),

  createPensionPlan: (payload: {
    familyId: string;
    monthlyAmount: string;
    startMonthKey: string;
    fundType?: FundPoolType;
    notes?: string;
  }) =>
    request<{plan: CharityPensionPlan}>('/api/pensions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePensionPlan: (
    planId: string,
    payload: {
      monthlyAmount?: string;
      status?: PensionStatus;
      fundType?: FundPoolType;
      notes?: string;
    },
  ) =>
    request<{plan: CharityPensionPlan}>(`/api/pensions/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  recordDisbursement: (payload: {
    familyId: string;
    monthKey: string;
    amount?: string;
    proofReference?: string;
    treasuryAccountId?: string | null;
    fundType?: FundPoolType;
    notes?: string;
  }) =>
    request<{disbursement: MonthlyAssistanceDisbursement}>('/api/pensions/disburse', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Donations & Donors
  getDonations: () =>
    request<{
      donations: DonationRecord[];
      donors: DonorSummaryRow[];
      treasuryAccounts: TreasuryAccount[];
      projects: Array<{id: string; code: string; name: string}>;
      activities: CharityActivity[];
      organizationSettings: OrganizationSettings;
    }>('/api/donations'),

  createDonation: (payload: {
    donorName?: string;
    donorPhone?: string;
    isAnonymous?: boolean;
    category: DonationCategory;
    paymentMethod: DonationPaymentMethod;
    amount: string;
    donationDate: string;
    treasuryAccountId?: string | null;
    projectId?: string | null;
    activityId?: string | null;
    inKindDescription?: string;
    notes?: string;
    warehouseInbound?: {
      itemName: string;
      category: WarehouseCategory;
      condition: WarehouseCondition;
      quantity: number;
      unit: string;
    };
  }) =>
    request<{donation: DonationRecord}>('/api/donations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Finance & Treasury (3-step Maker-Checker-Executor)
  getFinanceOverview: () => request<FinanceOverviewResponse>('/api/finance/overview'),

  createTreasuryAccount: (payload: {
    name: string;
    accountType: TreasuryAccountType;
    bankName?: string;
    accountNumberMasked?: string;
    openingBalance?: string;
  }) =>
    request<{account: TreasuryAccount}>('/api/finance/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createFinancialTransaction: (payload: {
    txType: Exclude<FinancialTxType, 'reversal'>;
    title: string;
    description?: string;
    amount: string;
    txDate: string;
    fundType: FundPoolType;
    purposeCategory: FinancialPurposeCategory;
    sourceAccountId: string;
    destinationAccountId?: string | null;
    projectId?: string | null;
    familyId?: string | null;
  }) =>
    request<{transaction: FinancialTransaction}>('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  approveFinancialTransaction: (txId: string, notes?: string) =>
    request<{transaction: FinancialTransaction}>(`/api/finance/transactions/${txId}/approve`, {
      method: 'POST',
      body: JSON.stringify({notes: notes || ''}),
    }),

  rejectFinancialTransaction: (txId: string, notes: string) =>
    request<{transaction: FinancialTransaction}>(`/api/finance/transactions/${txId}/reject`, {
      method: 'POST',
      body: JSON.stringify({notes}),
    }),

  executeFinancialTransaction: (txId: string, executionReference?: string) =>
    request<{transaction: FinancialTransaction}>(`/api/finance/transactions/${txId}/execute`, {
      method: 'POST',
      body: JSON.stringify({executionReference: executionReference || ''}),
    }),

  reverseFinancialTransaction: (txId: string, reason: string) =>
    request<{originalTransaction: FinancialTransaction; reversalEntry: FinancialTransaction}>(
      `/api/finance/transactions/${txId}/reverse`,
      {
        method: 'POST',
        body: JSON.stringify({reason}),
      },
    ),

  // Projects
  getProjects: () =>
    request<{
      projects: CharityProjectWithMetrics[];
      families: Array<{id: string; fileNumber: string; headOfHousehold: string}>;
    }>('/api/projects'),

  createProject: (payload: {
    name: string;
    category: CharityProjectCategory;
    description: string;
    budget: string;
    status?: 'active' | 'planned' | 'completed' | 'paused';
    beneficiaryFamilyIds?: string[];
  }) =>
    request<{project: CharityProjectWithMetrics}>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProject: (
    projectId: string,
    payload: {
      name?: string;
      description?: string;
      budget?: string;
      status?: 'active' | 'planned' | 'completed' | 'paused';
      completionPercent?: number;
      beneficiaryFamilyIds?: string[];
      finalReport?: string;
    },
  ) =>
    request<{project: CharityProjectWithMetrics}>(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadProjectAttachment: (
    projectId: string,
    payload: {fileName: string; mimeType: string; base64Data: string},
  ) =>
    request<{document: StoredDocumentRef; project: CharityProjectWithMetrics}>(
      `/api/projects/${projectId}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  // Warehouse
  getWarehouse: () =>
    request<{
      items: WarehouseItem[];
      movements: WarehouseMovement[];
      lowStockItems: WarehouseItem[];
      families: Array<{id: string; fileNumber: string; headOfHousehold: string}>;
    }>('/api/warehouse'),

  createWarehouseItem: (payload: {
    name: string;
    category: WarehouseCategory;
    condition: WarehouseCondition;
    unit: string;
    initialQty: number;
    minStockAlert: number;
    receivedDate?: string;
    donationSource?: string;
    notes?: string;
  }) =>
    request<{item: WarehouseItem}>('/api/warehouse/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createWarehouseMovement: (payload: {
    itemId: string;
    movementType: 'in' | 'out';
    quantity: number;
    movementDate?: string;
    sourceOrBeneficiary?: string;
    beneficiaryFamilyId?: string | null;
    notes?: string;
  }) =>
    request<{movement: WarehouseMovement; item: WarehouseItem}>('/api/warehouse/movements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Volunteers
  getVolunteers: () =>
    request<{volunteers: VolunteerProfile[]; tasks: ActivityTask[]}>('/api/volunteers'),

  createVolunteer: (payload: {
    fullName: string;
    phone: string;
    address?: string;
    skills?: string[];
    teamName?: string;
    joinedAt?: string;
  }) =>
    request<{volunteer: VolunteerProfile}>('/api/volunteers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateVolunteer: (
    volunteerId: string,
    payload: {
      fullName?: string;
      phone?: string;
      address?: string;
      skills?: string[];
      teamName?: string;
      rating?: number;
      evaluationNotes?: string;
      isActive?: boolean;
    },
  ) =>
    request<{volunteer: VolunteerProfile}>(`/api/volunteers/${volunteerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  assignVolunteerToTask: (volunteerId: string, taskId: string) =>
    request<{task: ActivityTask}>(`/api/volunteers/${volunteerId}/assign-task`, {
      method: 'POST',
      body: JSON.stringify({taskId}),
    }),

  // Board Registry
  getBoardRegistry: () => request<{members: AuthUser[]}>('/api/board/registry'),

  updateBoardMember: (
    userId: string,
    payload: {
      boardPosition?: string;
      membershipStatus?: 'active' | 'inactive' | 'honorary';
      phone?: string;
    },
  ) =>
    request<{member: AuthUser}>(`/api/board/registry/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Reports (12 live reports)
  getReport: (reportType: ReportTypeId, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<GeneratedReportResponse>(`/api/reports/${reportType}${suffix}`);
  },

  // Notifications
  getNotifications: () =>
    request<{notifications: AppNotification[]; count: number}>('/api/notifications'),

  // Settings & Backup
  getSettings: () => request<{settings: OrganizationSettings}>('/api/settings'),

  updateSettings: (payload: {
    nameAr?: string;
    sloganAr?: string;
    secondarySloganAr?: string;
    registrationNumber?: string;
    phone?: string;
    email?: string;
    address?: string;
    receiptPrefix?: string;
    receiptFooterAr?: string;
    authorizedSignerName?: string;
    customDonationTypes?: string[];
    customExpenseTypes?: string[];
    customAidTypes?: string[];
    logoUpload?: {fileName: string; mimeType: string; base64Data: string};
    resetLogoToDefault?: boolean;
  }) =>
    request<{settings: OrganizationSettings}>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  downloadBackupJson: () => request<Record<string, unknown>>('/api/settings/backup'),

  restoreBackupJson: (backupPayload: Record<string, unknown>) =>
    request<{
      success: boolean;
      snapshotFile: string;
      restoredCounts: Record<string, number>;
    }>('/api/settings/restore', {
      method: 'POST',
      body: JSON.stringify(backupPayload),
    }),
};
