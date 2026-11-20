import {
  AlertCircle,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  FileBarChart2,
  FolderKanban,
  HandHeart,
  HeartHandshake,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {OFFICIAL_LOGO_PATH} from '../lib/exportUtils';
import {formatArabicDateTime, formatInteger} from '../lib/formatters';
import {
  GRANULAR_PERM_LABELS_AR,
  MODULE_PERM_LABELS_AR,
  ROLE_META,
  type ActivityTask,
  type AppNotification,
  type AuthSession,
  type AuthUser,
  type BeneficiaryFamilyRecord,
  type CharityActivity,
  type DashboardOverviewData,
  type DashboardPeriodFilter,
  type ManagerModulePermissions,
  type MonthlyAssistanceDisbursement,
  type OrganizationSettings,
  type PasswordResetRequest,
  type SecurityAuditEntry,
  type UserGranularPermissions,
} from '../types/auth';
import {ConfirmDialog} from './dashboard/ConfirmDialog';
import {DonationsPanel} from './dashboard/DonationsPanel';
import {FamiliesAssistancePanel} from './dashboard/FamiliesAssistancePanel';
import {FinanceTreasuryPanel} from './dashboard/FinanceTreasuryPanel';
import type {CreateDonationInput} from './dashboard/FinancialChart';
import {
  NotificationsPanel,
  SettingsPanel,
} from './dashboard/NotificationsSettingsPanel';
import {OverviewStatsView} from './dashboard/OverviewStatsView';
import {PensionsPanel} from './dashboard/PensionsPanel';
import {ProjectsPanel} from './dashboard/ProjectsPanel';
import {ReportsPanel} from './dashboard/ReportsPanel';
import {
  BoardRegistryPanel,
  VolunteersPanel,
} from './dashboard/VolunteersBoardPanel';
import {WarehousePanel} from './dashboard/WarehousePanel';
import {InstallAppPage} from './InstallAppPage';
import {OfflineBanner, PWAInstallButton} from './PWAInstallButton';

export type DashboardTab =
  | 'overview'
  | 'families'
  | 'pensions'
  | 'donations'
  | 'finance'
  | 'projects'
  | 'warehouse'
  | 'volunteers'
  | 'activities'
  | 'board'
  | 'reports'
  | 'notifications'
  | 'users'
  | 'security'
  | 'settings'
  | 'install'
  | 'profile';

interface NavItem {
  id: DashboardTab;
  label: string;
  shortLabel: string;
  group: 'core' | 'charity' | 'admin';
  icon: ReactNode;
  badgeCount?: number;
}

const GRANULAR_PERM_KEYS = Object.keys(
  GRANULAR_PERM_LABELS_AR,
) as Array<keyof UserGranularPermissions>;

const MODULE_PERM_KEYS = Object.keys(
  MODULE_PERM_LABELS_AR,
) as Array<keyof ManagerModulePermissions>;

const EMPTY_GRANULAR_PERMS: UserGranularPermissions = {
  canViewData: false,
  canAddData: false,
  canEditData: false,
  canDeleteData: false,
  canApproveTransactions: false,
  canExecuteFinancial: false,
  canExportReports: false,
};

const FULL_GRANULAR_PERMS: UserGranularPermissions = {
  canViewData: true,
  canAddData: true,
  canEditData: true,
  canDeleteData: true,
  canApproveTransactions: true,
  canExecuteFinancial: true,
  canExportReports: true,
};

const EMPTY_MODULE_PERMS: ManagerModulePermissions = {
  families: false,
  pensions: false,
  donations: false,
  finance: false,
  projects: false,
  warehouse: false,
  volunteers: false,
  activities: false,
  reports: false,
};

const FULL_MODULE_PERMS: ManagerModulePermissions = {
  families: true,
  pensions: true,
  donations: true,
  finance: true,
  projects: true,
  warehouse: true,
  volunteers: true,
  activities: true,
  reports: true,
};

const ACTIVITY_STATUS_AR: Record<CharityActivity['status'], string> = {
  active: 'نشط',
  planned: 'قيد التخطيط',
  completed: 'مكتمل',
};

const TASK_STATUS_AR: Record<ActivityTask['status'], string> = {
  open: 'مفتوحة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
};

interface DashboardShellProps {
  session: AuthSession;
  onGoHome: () => void;
}

export function DashboardShell({session, onGoHome}: DashboardShellProps) {
  const {logout, refreshSession, updateSession} = useAuth();
  const {user, permissions} = session;
  const roleInfo = ROLE_META[user.role];

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [overviewPeriod, setOverviewPeriod] = useState<DashboardPeriodFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);

  // Core data states (strictly fetched from authenticated server APIs)
  const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
  const [families, setFamilies] = useState<BeneficiaryFamilyRecord[]>([]);
  const [disbursements, setDisbursements] = useState<MonthlyAssistanceDisbursement[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [activities, setActivities] = useState<CharityActivity[]>([]);
  const [activityManagers, setActivityManagers] = useState<
    Array<{id: string; fullName: string; username: string}>
  >([]);
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [loadingTab, setLoadingTab] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Create Manager form (President Only — Zero Permissions by Default + Mandatory First-Login Password Change)
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewUserPass, setShowNewUserPass] = useState(false);
  const [newUserBoardPosition, setNewUserBoardPosition] = useState('');
  const [newUserGranular, setNewUserGranular] = useState<UserGranularPermissions>({
    ...EMPTY_GRANULAR_PERMS,
  });
  const [newUserModules, setNewUserModules] = useState<ManagerModulePermissions>({
    ...EMPTY_MODULE_PERMS,
  });
  const [confirmToggleUser, setConfirmToggleUser] = useState<AuthUser | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AuthUser | null>(null);

  // Inline Edit Manager Details (President Only)
  const [editingManagerId, setEditingManagerId] = useState<string | null>(null);
  const [editMgrFullName, setEditMgrFullName] = useState('');
  const [editMgrEmail, setEditMgrEmail] = useState('');
  const [editMgrPhone, setEditMgrPhone] = useState('');
  const [editMgrBoardPosition, setEditMgrBoardPosition] = useState('');

  // Inline Reset Manager Temporary Password (President Only)
  const [tempPassManagerId, setTempPassManagerId] = useState<string | null>(null);
  const [tempPassValue, setTempPassValue] = useState('');
  const [showTempPassValue, setShowTempPassValue] = useState(false);

  // Create Activity form
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [actName, setActName] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actManagerId, setActManagerId] = useState('');

  // Create Task form
  const [taskActivityId, setTaskActivityId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskVisibleBoard, setTaskVisibleBoard] = useState(true);
  const [taskOpenVol, setTaskOpenVol] = useState(true);
  const [showCreateTask, setShowCreateTask] = useState(false);

  // Change Password form
  const [currPass, setCurrPass] = useState('');
  const [nextPass, setNextPass] = useState('');
  const [showCurrPass, setShowCurrPass] = useState(false);
  const [showNextPass, setShowNextPass] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  const handleFeedback = useCallback((msg: {type: 'success' | 'error'; text: string}) => {
    if (msg.type === 'success') {
      setErrorBanner(null);
      setSuccessBanner(msg.text);
    } else {
      setSuccessBanner(null);
      setErrorBanner(msg.text);
    }
  }, []);

  const canAccessFamilies = permissions.canManageFamilies;
  const canAccessPensions = permissions.modulePermissions.pensions && permissions.canViewData;
  const canAccessDonations = permissions.modulePermissions.donations && permissions.canViewData;
  const canAccessFinance = permissions.canViewTreasury;
  const canAccessProjects = permissions.canManageProjects;
  const canAccessWarehouse = permissions.canManageWarehouse;
  const canAccessVolunteers = permissions.canManageVolunteers;
  const canAccessActivities = permissions.canViewAllActivities;
  const canAccessBoard = permissions.canManageBoardRegistry;
  const canAccessReports = permissions.modulePermissions.reports && permissions.canExportReports;

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      {
        id: 'overview',
        label: 'لوحة التحكم التنفيذية',
        shortLabel: 'الرئيسية',
        group: 'core',
        icon: <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden="true" />,
      },
    ];

    if (canAccessFamilies) {
      items.push({
        id: 'families',
        label: 'الأسر المستفيدة',
        shortLabel: 'الأسر',
        group: 'charity',
        icon: <HeartHandshake className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessPensions) {
      items.push({
        id: 'pensions',
        label: 'معاشات الخير',
        shortLabel: 'المعاشات',
        group: 'charity',
        icon: <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessDonations) {
      items.push({
        id: 'donations',
        label: 'التبرعات والمتبرعون',
        shortLabel: 'التبرعات',
        group: 'charity',
        icon: <HandHeart className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessFinance) {
      items.push({
        id: 'finance',
        label: 'المالية والخزينة',
        shortLabel: 'الخزينة',
        group: 'charity',
        icon: <Landmark className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessProjects) {
      items.push({
        id: 'projects',
        label: 'المشروعات الخيرية',
        shortLabel: 'المشروعات',
        group: 'charity',
        icon: <Briefcase className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessWarehouse) {
      items.push({
        id: 'warehouse',
        label: 'المخازن والتبرعات العينية',
        shortLabel: 'المخازن',
        group: 'charity',
        icon: <Package className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessVolunteers) {
      items.push({
        id: 'volunteers',
        label: 'إدارة المتطوعين',
        shortLabel: 'المتطوعون',
        group: 'charity',
        icon: <UserCheck className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessActivities) {
      items.push({
        id: 'activities',
        label: 'الأنشطة والمهام الميدانية',
        shortLabel: 'الأنشطة',
        group: 'charity',
        icon: <FolderKanban className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessBoard) {
      items.push({
        id: 'board',
        label: 'مجلس الإدارة',
        shortLabel: 'المجلس',
        group: 'admin',
        icon: <Building2 className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (canAccessReports) {
      items.push({
        id: 'reports',
        label: 'التقارير والإحصائيات',
        shortLabel: 'التقارير',
        group: 'admin',
        icon: <FileBarChart2 className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    items.push({
      id: 'notifications',
      label: 'الإشعارات والتنبيهات',
      shortLabel: 'التنبيهات',
      group: 'admin',
      icon: <Bell className="h-5 w-5 shrink-0" aria-hidden="true" />,
      badgeCount: notifications.length,
    });

    if (permissions.canManageUsers) {
      items.push({
        id: 'users',
        label: 'إدارة المديرين والصلاحيات',
        shortLabel: 'المديرون',
        group: 'admin',
        icon: <Users className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (permissions.canViewSecurityLogs) {
      items.push({
        id: 'security',
        label: 'سجل الأمان والتدقيق',
        shortLabel: 'التدقيق',
        group: 'admin',
        icon: <Shield className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    if (permissions.canManageSettings) {
      items.push({
        id: 'settings',
        label: 'إعدادات الجمعية والنسخ',
        shortLabel: 'الإعدادات',
        group: 'admin',
        icon: <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />,
      });
    }

    items.push({
      id: 'install',
      label: 'تثبيت تطبيق أبواب الخير',
      shortLabel: 'تثبيت',
      group: 'admin',
      icon: <Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />,
    });

    items.push({
      id: 'profile',
      label: 'حسابي وكلمة المرور',
      shortLabel: 'حسابي',
      group: 'admin',
      icon: <KeyRound className="h-5 w-5 shrink-0" aria-hidden="true" />,
    });

    return items;
  }, [
    canAccessActivities,
    canAccessBoard,
    canAccessDonations,
    canAccessFamilies,
    canAccessFinance,
    canAccessPensions,
    canAccessProjects,
    canAccessReports,
    canAccessVolunteers,
    canAccessWarehouse,
    notifications.length,
    permissions.canManageSettings,
    permissions.canManageUsers,
    permissions.canViewSecurityLogs,
  ]);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch {
      // Non-blocking background refresh
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    api
      .getSettings()
      .then((res) => setOrgSettings(res.settings))
      .catch(() => {
        // Fallback to default brand assets
      });
  }, [loadNotifications]);

  const loadTabData = useCallback(
    async (tab: DashboardTab, period: DashboardPeriodFilter = overviewPeriod) => {
      // Self-managed tabs fetch their own data inside their dedicated panels
      if (
        tab === 'pensions' ||
        tab === 'donations' ||
        tab === 'finance' ||
        tab === 'projects' ||
        tab === 'warehouse' ||
        tab === 'volunteers' ||
        tab === 'board' ||
        tab === 'reports' ||
        tab === 'settings' ||
        tab === 'install' ||
        tab === 'profile'
      ) {
        return;
      }

      if (tab === 'notifications') {
        await loadNotifications();
        return;
      }

      setLoadingTab(true);
      setErrorBanner(null);
      try {
        if (tab === 'overview') {
          const data = await api.getOverview(period);
          setOverview(data);
        } else if (tab === 'families') {
          const data = await api.getFamilies();
          setFamilies(data.families);
          setDisbursements(data.disbursements);
          setActivities(data.activities);
        } else if (tab === 'users') {
          const data = await api.getAdminUsers();
          setUsers(data.users);
          setActivities(data.activities);
          setResetRequests(data.passwordResetRequests);
        } else if (tab === 'activities') {
          const [actRes, taskRes] = await Promise.all([api.getActivities(), api.getTasks()]);
          setActivities(actRes.activities);
          setActivityManagers(actRes.managers);
          setTasks(taskRes.tasks);
          if (actRes.activities.length > 0 && !taskActivityId) {
            setTaskActivityId(actRes.activities[0].id);
          }
        } else if (tab === 'security') {
          const logRes = await api.getSecurityLogs();
          setSecurityLogs(logRes.logs);
        }
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'تعذر تحميل بيانات القسم.');
      } finally {
        setLoadingTab(false);
      }
    },
    [loadNotifications, overviewPeriod, taskActivityId],
  );

  useEffect(() => {
    void loadTabData(activeTab, overviewPeriod);
  }, [activeTab, overviewPeriod, loadTabData]);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const target = navItems.find((item) => item.id === tabId);
      if (target) {
        setActiveTab(target.id);
      } else {
        setActiveTab('overview');
      }
      setDrawerOpen(false);
      setSuccessBanner(null);
      setErrorBanner(null);
    },
    [navItems],
  );

  const handleDataChanged = useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  const handleLogout = async () => {
    await logout();
    onGoHome();
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createAdminUser({
        fullName: newUserFullName,
        username: newUserUsername,
        email: newUserEmail,
        phone: newUserPhone,
        password: newUserPassword,
        role: 'manager',
        boardPosition: newUserBoardPosition.trim() || undefined,
        granularPermissions: newUserGranular,
        modulePermissions: newUserModules,
      });
      setNewUserFullName('');
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('');
      setNewUserBoardPosition('');
      setNewUserGranular({...EMPTY_GRANULAR_PERMS});
      setNewUserModules({...EMPTY_MODULE_PERMS});
      setShowCreateUser(false);
      setSuccessBanner(
        'تم إنشاء حساب المدير وتطبيق الصلاحيات المحددة على الخادم؛ وسيُطلب منه تغيير كلمة المرور المؤقتة فور أول تسجيل دخول.',
      );
      await loadTabData('users');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر إنشاء حساب المدير.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleUpdateUser = async (
    targetId: string,
    payload: Parameters<typeof api.updateAdminUser>[1],
  ) => {
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateAdminUser(targetId, payload);
      setSuccessBanner('تم تحديث بيانات وصلاحيات المستخدم فعلياً على الخادم.');
      await loadTabData('users');
      if (targetId === user.id) {
        await refreshSession();
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تحديث بيانات المستخدم.');
    }
  };

  const handleStartEditManager = (target: AuthUser) => {
    if (editingManagerId === target.id) {
      setEditingManagerId(null);
      return;
    }
    setTempPassManagerId(null);
    setTempPassValue('');
    setEditingManagerId(target.id);
    setEditMgrFullName(target.fullName);
    setEditMgrEmail(target.email);
    setEditMgrPhone(target.phone || '');
    setEditMgrBoardPosition(target.boardPosition || '');
  };

  const handleSaveManagerDetails = async (e: FormEvent, targetId: string) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateAdminUser(targetId, {
        fullName: editMgrFullName.trim(),
        email: editMgrEmail.trim(),
        phone: editMgrPhone.trim(),
        boardPosition: editMgrBoardPosition.trim(),
      });
      setEditingManagerId(null);
      setSuccessBanner('تم تحديث البيانات الأساسية لحساب المدير وتوثيق التعديل في سجل التدقيق.');
      await loadTabData('users');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تحديث بيانات المدير.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResetTempPassword = async (e: FormEvent, target: AuthUser) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.resetManagerTempPassword(target.id, tempPassValue);
      setTempPassValue('');
      setTempPassManagerId(null);
      setShowTempPassValue(false);
      setSuccessBanner(
        `تم تعيين كلمة مرور مؤقتة جديدة للمدير «${target.fullName}»، وسيُجبر على تغييرها عند تسجيل الدخول القادم.`,
      );
      await loadTabData('users');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تعيين كلمة المرور المؤقتة.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeleteUser = async (target: AuthUser) => {
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.deleteAdminUser(target.id);
      if (editingManagerId === target.id) setEditingManagerId(null);
      if (tempPassManagerId === target.id) {
        setTempPassManagerId(null);
        setTempPassValue('');
      }
      setSuccessBanner(
        `تم حذف حساب المدير «${target.fullName}» نهائياً مع الاحتفاظ بسجلات التدقيق والعمليات التاريخية.`,
      );
      await loadTabData('users');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر حذف حساب المدير.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCreateActivity = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createActivity({
        name: actName,
        description: actDesc,
        managerUserId: actManagerId || null,
      });
      setActName('');
      setActDesc('');
      setActManagerId('');
      setShowCreateActivity(false);
      setSuccessBanner('تم إنشاء النشاط بنجاح.');
      await loadTabData('activities');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر إنشاء النشاط.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleUpdateActivityStatus = async (
    activityId: string,
    status: CharityActivity['status'],
  ) => {
    setErrorBanner(null);
    try {
      await api.updateActivity(activityId, {status});
      setSuccessBanner('تم تحديث حالة النشاط.');
      await loadTabData('activities');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تحديث النشاط.');
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createTask({
        activityId: taskActivityId,
        title: taskTitle,
        description: taskDesc,
        dueDate: taskDueDate || null,
        visibleToBoard: taskVisibleBoard,
        openForVolunteers: taskOpenVol,
      });
      setTaskTitle('');
      setTaskDesc('');
      setTaskDueDate('');
      setShowCreateTask(false);
      setSuccessBanner('تمت إضافة المهمة بنجاح.');
      await Promise.all([loadTabData('activities'), loadNotifications()]);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر إضافة المهمة.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const res = await api.changePassword({currentPassword: currPass, newPassword: nextPass});
      if (res.session) {
        updateSession(res.session);
      }
      setCurrPass('');
      setNextPass('');
      setSuccessBanner('تم تغيير كلمة المرور بنجاح.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRecordDonationQuick = async (payload: CreateDonationInput): Promise<boolean> => {
    setSubmittingAction(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createDonation(payload);
      setSuccessBanner('تم تسجيل التبرع وتحديث الخزينة والرسم البياني بنجاح.');
      await Promise.all([loadTabData('overview', overviewPeriod), loadNotifications()]);
      return true;
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'تعذر تسجيل التبرع.');
      return false;
    } finally {
      setSubmittingAction(false);
    }
  };

  const activeNavMeta = navItems.find((i) => i.id === activeTab) || navItems[0];
  const mobileBottomItems = navItems.slice(0, 3);
  const effectiveLogoSrc = orgSettings?.customLogoUrl || OFFICIAL_LOGO_PATH;
  const effectiveOrgName = orgSettings?.nameAr || 'أبواب الخير';

  const groupedNav = useMemo(
    () => [
      {title: 'الإدارة العامة', items: navItems.filter((i) => i.group === 'core')},
      {title: 'الأنشطة الخيرية والمالية', items: navItems.filter((i) => i.group === 'charity')},
      {title: 'الحوكمة والتقارير والنظام', items: navItems.filter((i) => i.group === 'admin')},
    ],
    [navItems],
  );

  return (
    <div dir="rtl" className="min-h-dvh bg-[#F7FAF8] text-[#102A24] lg:flex">
      {/* Desktop Right-Hand RTL Sidebar */}
      <aside className="hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:border-l lg:border-[#167764]/12 lg:bg-white">
        <div className="flex h-16 items-center gap-3 border-b border-[#167764]/10 px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#167764]/15 bg-[#FBF2E0] p-1">
            {!logoError ? (
              <img
                src={effectiveLogoSrc}
                alt={`شعار ${effectiveOrgName}`}
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs font-bold text-[#167764]">أبواب</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold text-[#0F4F42] truncate">
              {effectiveOrgName}
            </p>
            <p className="text-xs text-[#32764C] truncate">نظام الإدارة الشامل</p>
          </div>
        </div>

        {/* Authenticated User Identity Block */}
        <div className="border-b border-[#167764]/10 bg-[#EEF7F0]/65 px-5 py-3.5">
          <p className="text-sm font-bold text-[#0F4F42] truncate">{user.fullName}</p>
          <p className="mt-0.5 text-xs font-semibold text-[#167764]">{roleInfo.labelAr}</p>
          <p className="mt-0.5 text-[11px] text-[#102A24]/60 truncate" dir="ltr">
            @{user.username}
          </p>
        </div>

        {/* Grouped Navigation Links */}
        <nav aria-label="قائمة لوحة التحكم" className="flex-1 space-y-4 overflow-y-auto p-3">
          {groupedNav.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.title} className="space-y-1">
                  <p className="px-3 text-[11px] font-bold text-[#102A24]/45">{group.title}</p>
                  {group.items.map((item) => {
                    const isActive = item.id === activeTab;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-right text-sm font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#167764] text-white'
                            : 'text-[#102A24]/80 hover:bg-[#EEF7F0] hover:text-[#0F4F42]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badgeCount && item.badgeCount > 0 ? (
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-[#FDF6E4] text-[#9A6F18]'
                            }`}
                          >
                            {formatInteger(item.badgeCount)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ),
          )}
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-[#167764]/10 p-3 space-y-1">
          <button
            type="button"
            onClick={onGoHome}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#0F4F42] transition-colors hover:bg-[#EEF7F0] cursor-pointer"
          >
            <Home className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>الصفحة الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 cursor-pointer"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#167764]/12 bg-white/95 px-4 backdrop-blur-md lg:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح القائمة الجانبية"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#0F4F42] hover:bg-[#EEF7F0] lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base font-extrabold text-[#0F4F42] truncate sm:text-lg">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton onOpenInstallPage={() => handleSelectTab('install')} />
            <span className="hidden md:inline text-xs font-medium text-[#102A24]/70">
              {user.fullName} · {roleInfo.labelAr}
            </span>

            {/* Live Notifications Bell Button */}
            <button
              type="button"
              onClick={() => handleSelectTab('notifications')}
              aria-label="الإشعارات والتنبيهات"
              className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                activeTab === 'notifications'
                  ? 'border-[#167764] bg-[#167764] text-white'
                  : 'border-[#167764]/18 bg-white text-[#0F4F42] hover:bg-[#EEF7F0]'
              }`}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -left-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D9A436] px-1 text-[10px] font-extrabold text-white tabular-nums">
                  {notifications.length > 99 ? '99+' : notifications.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          </div>
        </header>

        {/* Mobile RTL Slide-Over Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-black/45 backdrop-blur-xs"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative z-10 flex h-full w-80 max-w-[88vw] flex-col bg-white shadow-2xl">
              <div className="flex h-16 items-center justify-between border-b border-[#167764]/12 px-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#167764]/15 bg-[#FBF2E0] p-1">
                    <img
                      src={effectiveLogoSrc}
                      alt={`شعار ${effectiveOrgName}`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <span className="font-display text-lg font-extrabold text-[#0F4F42]">
                    {effectiveOrgName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="إغلاق القائمة"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#102A24]/70 hover:bg-[#EEF7F0] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-[#167764]/10 bg-[#EEF7F0]/70 px-4 py-3.5">
                <p className="text-sm font-bold text-[#0F4F42]">{user.fullName}</p>
                <p className="mt-0.5 text-xs font-semibold text-[#167764]">{roleInfo.labelAr}</p>
                <p className="mt-0.5 text-xs text-[#102A24]/65" dir="ltr">
                  {user.email}
                </p>
              </div>

              <nav className="flex-1 space-y-4 overflow-y-auto p-3">
                {groupedNav.map(
                  (group) =>
                    group.items.length > 0 && (
                      <div key={group.title} className="space-y-1">
                        <p className="px-3 text-[11px] font-bold text-[#102A24]/45">
                          {group.title}
                        </p>
                        {group.items.map((item) => {
                          const isActive = item.id === activeTab;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectTab(item.id)}
                              className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-right text-sm font-semibold cursor-pointer ${
                                isActive
                                  ? 'bg-[#167764] text-white'
                                  : 'text-[#102A24]/85 hover:bg-[#EEF7F0]'
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                {item.icon}
                                <span>{item.label}</span>
                              </span>
                              {item.badgeCount && item.badgeCount > 0 ? (
                                <span
                                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                    isActive
                                      ? 'bg-white/20 text-white'
                                      : 'bg-[#FDF6E4] text-[#9A6F18]'
                                  }`}
                                >
                                  {formatInteger(item.badgeCount)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ),
                )}
              </nav>

              <div className="border-t border-[#167764]/10 p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onGoHome();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                >
                  <Home className="h-5 w-5" aria-hidden="true" />
                  <span>الصفحة الرئيسية</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Scrollable Content Area */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pb-12">
          {/* Global Status Feedback Banners */}
          {errorBanner && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                aria-label="إغلاق التنبيه"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-700 hover:bg-red-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {successBanner && (
            <div
              role="status"
              className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-3 text-sm text-[#0F4F42]"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#167764]"
                  aria-hidden="true"
                />
                <span>{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner(null)}
                aria-label="إغلاق التنبيه"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#167764] hover:bg-[#167764]/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* MODULE 2: EXECUTIVE DASHBOARD OVERVIEW */}
          {activeTab === 'overview' && (
            <OverviewStatsView
              user={user}
              permissions={permissions}
              overview={overview}
              period={overviewPeriod}
              onChangePeriod={(p) => setOverviewPeriod(p)}
              loading={loadingTab}
              submitting={submittingAction}
              onRecordDonation={handleRecordDonationQuick}
              onNavigate={handleSelectTab}
            />
          )}

          {/* MODULE 3: BENEFICIARY FAMILIES */}
          {activeTab === 'families' && canAccessFamilies && (
            <FamiliesAssistancePanel
              user={user}
              permissions={permissions}
              families={families}
              disbursements={disbursements}
              activities={activities}
              loading={loadingTab}
              onRefresh={async () => {
                await Promise.all([loadTabData('families'), loadNotifications()]);
              }}
              onFeedback={handleFeedback}
            />
          )}

          {/* MODULE 4: CHARITY PENSIONS (معاشات الخير) */}
          {activeTab === 'pensions' && canAccessPensions && (
            <PensionsPanel
              user={user}
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* MODULE 5: DONATIONS & DONORS */}
          {activeTab === 'donations' && canAccessDonations && (
            <DonationsPanel
              user={user}
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* MODULE 6: FINANCE, TREASURY & SHARIA FUND SEGREGATION */}
          {activeTab === 'finance' && canAccessFinance && (
            <FinanceTreasuryPanel
              user={user}
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* MODULE 7: CHARITY PROJECTS */}
          {activeTab === 'projects' && canAccessProjects && (
            <ProjectsPanel
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* MODULE 8: WAREHOUSE & IN-KIND INVENTORY */}
          {activeTab === 'warehouse' && canAccessWarehouse && (
            <WarehousePanel
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* MODULE 9: VOLUNTEERS MANAGEMENT */}
          {activeTab === 'volunteers' && canAccessVolunteers && (
            <VolunteersPanel
              permissions={permissions}
              onFeedback={handleFeedback}
              onDataChanged={handleDataChanged}
            />
          )}

          {/* ACTIVITIES & FIELD TASKS */}
          {activeTab === 'activities' && canAccessActivities && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
                      إدارة ومتابعة الأنشطة والمهام الميدانية
                    </h2>
                    <p className="text-sm text-[#102A24]/70">
                      إنشاء الأنشطة وتكليف المديرين المشرفين وتوزيع المهام الميدانية على المتطوعين.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {permissions.canCreateActivities && (
                      <button
                        type="button"
                        onClick={() => setShowCreateActivity((v) => !v)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F4F42] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>إضافة نشاط</span>
                      </button>
                    )}
                    {permissions.canCreateTasks && activities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCreateTask((v) => !v)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#167764]/25 bg-[#EEF7F0] px-4 py-2 text-sm font-semibold text-[#0F4F42] hover:bg-[#dff0e3] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>إضافة مهمة</span>
                      </button>
                    )}
                  </div>
                </div>

                {showCreateActivity && permissions.canCreateActivities && (
                  <form
                    onSubmit={handleCreateActivity}
                    className="rounded-3xl border border-[#167764]/15 bg-white p-6 space-y-4"
                  >
                    <h3 className="font-display text-lg font-bold text-[#0F4F42]">
                      تسجيل نشاط جديد
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-[#0F4F42]">
                          اسم النشاط
                        </label>
                        <input
                          type="text"
                          required
                          value={actName}
                          onChange={(e) => setActName(e.target.value)}
                          placeholder="مثال: نشاط الإطعام وكفالة الأسر"
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#0F4F42]">
                          مسؤول النشاط (اختياري)
                        </label>
                        <select
                          value={actManagerId}
                          onChange={(e) => setActManagerId(e.target.value)}
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                        >
                          <option value="">— دون تكليف حالياً —</option>
                          {activityManagers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fullName} (@{m.username})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        وصف النشاط
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={actDesc}
                        onChange={(e) => setActDesc(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={submittingAction}
                        className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
                      >
                        حفظ النشاط
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateActivity(false)}
                        className="min-h-[44px] rounded-xl border border-[#167764]/20 px-4 py-2.5 text-sm font-semibold text-[#102A24] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}

                {showCreateTask && permissions.canCreateTasks && activities.length > 0 && (
                  <form
                    onSubmit={handleCreateTask}
                    className="rounded-3xl border border-[#167764]/15 bg-white p-6 space-y-4"
                  >
                    <h3 className="font-display text-lg font-bold text-[#0F4F42]">
                      إضافة مهمة ميدانية جديدة
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-[#0F4F42]">
                          النشاط التابع له
                        </label>
                        <select
                          required
                          value={taskActivityId}
                          onChange={(e) => setTaskActivityId(e.target.value)}
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                        >
                          {activities.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#0F4F42]">
                          عنوان المهمة
                        </label>
                        <input
                          type="text"
                          required
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#0F4F42]">
                          تاريخ مستهدف (اختياري)
                        </label>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        تفاصيل المهمة
                      </label>
                      <textarea
                        required
                        rows={2}
                        value={taskDesc}
                        onChange={(e) => setTaskDesc(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-5 text-sm">
                      <label className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taskVisibleBoard}
                          onChange={(e) => setTaskVisibleBoard(e.target.checked)}
                          className="h-4 w-4 accent-[#167764]"
                        />
                        <span>إتاحة الاطلاع لأعضاء مجلس الإدارة</span>
                      </label>
                      <label className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taskOpenVol}
                          onChange={(e) => setTaskOpenVol(e.target.checked)}
                          className="h-4 w-4 accent-[#167764]"
                        />
                        <span>فتح المشاركة للمتطوعين</span>
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={submittingAction}
                        className="min-h-[44px] rounded-xl bg-[#167764] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] cursor-pointer"
                      >
                        حفظ المهمة
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateTask(false)}
                        className="min-h-[44px] rounded-xl border border-[#167764]/20 px-4 py-2.5 text-sm font-semibold text-[#102A24] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}

                {activities.length === 0 ? (
                  <div className="rounded-3xl border border-[#167764]/12 bg-white p-8 text-center">
                    <p className="font-display text-base font-bold text-[#0F4F42]">
                      لا توجد أنشطة مسجلة حتى الآن
                    </p>
                    <p className="mt-1.5 text-sm text-[#102A24]/70">
                      يمكنك البدء بإضافة أول نشاط فعلي للمؤسسة عبر زر «إضافة نشاط».
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {activities.map((act) => (
                      <article
                        key={act.id}
                        className="rounded-2xl border border-[#167764]/12 bg-white p-5 flex flex-col justify-between gap-4"
                      >
                        <div>
                          <p className="text-xs font-semibold text-[#32764C]">
                            {ACTIVITY_STATUS_AR[act.status]} · المشرف:{' '}
                            {act.managerName || 'غير محدد بعد'}
                          </p>
                          <h3 className="mt-1 font-display text-lg font-bold text-[#0F4F42]">
                            {act.name}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-[#102A24]/80">
                            {act.description}
                          </p>
                        </div>

                        {permissions.canEditData && (
                          <div className="flex items-center justify-between gap-3 border-t border-[#167764]/10 pt-3">
                            <label className="text-xs text-[#102A24]/65">حالة النشاط:</label>
                            <select
                              value={act.status}
                              onChange={(e) =>
                                handleUpdateActivityStatus(
                                  act.id,
                                  e.target.value as CharityActivity['status'],
                                )
                              }
                              className="min-h-[40px] rounded-lg border border-[#167764]/20 bg-[#F7FAF8] px-3 py-1.5 text-xs font-semibold"
                            >
                              <option value="active">نشط</option>
                              <option value="planned">قيد التخطيط</option>
                              <option value="completed">مكتمل</option>
                            </select>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {tasks.length > 0 && (
                  <section className="rounded-3xl border border-[#167764]/12 bg-white p-6">
                    <h3 className="font-display text-lg font-bold text-[#0F4F42]">
                      المهام المرتبطة ({formatInteger(tasks.length)})
                    </h3>
                    <div className="mt-4 divide-y divide-[#167764]/10">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-xs font-semibold text-[#32764C]">
                              {task.activityName} · {TASK_STATUS_AR[task.status]} · مشاركون:{' '}
                              <span className="tabular-nums">{task.participantIds.length}</span>
                              {task.dueDate ? ` · الموعد: ${task.dueDate}` : ''}
                            </p>
                            <p className="mt-1 font-display text-base font-bold text-[#0F4F42]">
                              {task.title}
                            </p>
                            <p className="mt-1 text-sm text-[#102A24]/75">{task.description}</p>
                          </div>

                          {permissions.canEditData && (
                            <select
                              value={task.status}
                              onChange={async (e) => {
                                try {
                                  await api.updateTaskStatus(
                                    task.id,
                                    e.target.value as ActivityTask['status'],
                                  );
                                  await loadTabData('activities');
                                } catch (err) {
                                  setErrorBanner(
                                    err instanceof Error ? err.message : 'تعذر تحديث حالة المهمة.',
                                  );
                                }
                              }}
                              className="min-h-[44px] self-start rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-2 text-xs font-semibold sm:self-center"
                            >
                              <option value="open">مفتوحة</option>
                              <option value="in_progress">قيد التنفيذ</option>
                              <option value="completed">مكتملة</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

          {/* MODULE 10: BOARD OF DIRECTORS REGISTRY (CHAIRMAN ONLY) */}
          {activeTab === 'board' && canAccessBoard && (
            <BoardRegistryPanel currentUser={user} onFeedback={handleFeedback} />
          )}

          {/* MODULE 11: REPORTS & STATISTICS (12 LIVE REPORTS + EXCEL/PDF EXPORT) */}
          {activeTab === 'reports' && canAccessReports && (
            <ReportsPanel onFeedback={handleFeedback} />
          )}

          {/* MODULE 12: NOTIFICATIONS CENTER */}
          {activeTab === 'notifications' && (
            <NotificationsPanel
              notifications={notifications}
              loading={loadingNotifications}
              onRefresh={loadNotifications}
              onNavigate={handleSelectTab}
            />
          )}

          {/* MODULE 1: MANAGERS & GRANULAR PERMISSIONS (PRESIDENT ONLY) */}
          {activeTab === 'users' && permissions.canManageUsers && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
                    إدارة المديرين والصلاحيات التفصيلية
                  </h2>
                  <p className="text-sm text-[#102A24]/70">
                    حساب رئيس مجلس الإدارة هو الحساب القيادي الأساسي والوحيد؛ ومن هنا يُنشئ الرئيس
                    حسابات المديرين المستقلة ويحدد صلاحيات كل مدير أو يعدّل بياناته أو يعيّن له
                    كلمة مرور مؤقتة أو يوقف حسابه أو يحذفه في أي وقت.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateUser((v) => !v)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#167764] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0F4F42] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{showCreateUser ? 'إغلاق النموذج' : 'إضافة مدير جديد'}</span>
                </button>
              </div>

              {/* Active Password Recovery Requests */}
              {resetRequests.length > 0 && (
                <section className="rounded-3xl border border-amber-300/60 bg-amber-50/70 p-5">
                  <h3 className="font-display text-base font-bold text-amber-950">
                    طلبات استعادة كلمة المرور النشطة
                  </h3>
                  <p className="mt-1 text-xs text-amber-900/80">
                    يُرجى التحقق من هوية صاحب الطلب قبل مشاركة رمز الاستعادة (صالح لمدة ٣٠ دقيقة).
                  </p>
                  <div className="mt-4 divide-y divide-amber-200">
                    {resetRequests.map((reqItem) => (
                      <div
                        key={reqItem.id}
                        className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-sm">
                          <p className="font-bold text-amber-950">{reqItem.userFullName}</p>
                          <p className="text-xs text-amber-900/80">
                            @{reqItem.username} · {reqItem.email}
                          </p>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="font-display text-lg font-extrabold tracking-[0.2em] tabular-nums text-[#0F4F42]">
                            {reqItem.code}
                          </span>
                          <p className="text-xs text-amber-900/75">
                            ينتهي: {formatArabicDateTime(reqItem.expiresAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Create Manager Form (Zero Permissions by Default) */}
              {showCreateUser && (
                <form
                  onSubmit={handleCreateUser}
                  className="rounded-3xl border border-[#167764]/15 bg-white p-6 space-y-5"
                >
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0F4F42]">
                      إنشاء حساب مدير مستقل جديد
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-[#102A24]/75">
                      يُنشأ الحساب الجديد بنوع <strong>«مدير»</strong> وبصلاحيات صفرية افتراضياً
                      (لا يمتلك أي صلاحيات تلقائية) لحين تحديدها أدناه أو لاحقاً، كما يُجبر المدير
                      خادمياً على تغيير كلمة المرور المؤقتة عند أول تسجيل دخول.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        الاسم الكامل
                      </label>
                      <input
                        type="text"
                        required
                        value={newUserFullName}
                        onChange={(e) => setNewUserFullName(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        اسم المستخدم (إنجليزي)
                      </label>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={newUserUsername}
                        onChange={(e) => setNewUserUsername(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-left text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        البريد الإلكتروني
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-left text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        رقم الهاتف (اختياري)
                      </label>
                      <input
                        type="tel"
                        dir="ltr"
                        value={newUserPhone}
                        onChange={(e) => setNewUserPhone(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-left text-sm tabular-nums focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        الصفة / المسمى الإداري (اختياري)
                      </label>
                      <input
                        type="text"
                        value={newUserBoardPosition}
                        onChange={(e) => setNewUserBoardPosition(e.target.value)}
                        placeholder="مثال: المدير التنفيذي / المدير المالي / مدير البرامج"
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-2.5 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F4F42]">
                        كلمة المرور المؤقتة (٨ أحرف فأكثر)
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          type={showNewUserPass ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          className="min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-2.5 pr-3.5 pl-12 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewUserPass((p) => !p)}
                          aria-label={showNewUserPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          className="absolute top-1/2 left-1 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] cursor-pointer"
                        >
                          {showNewUserPass ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 9 Operational Module Permissions (Default: All False) */}
                  <div className="rounded-2xl border border-[#167764]/15 bg-[#F7FAF8] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#0F4F42]">
                        ١. الأقسام المصرّح للمدير بالوصول إليها (افتراضياً: بدون صلاحيات):
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewUserModules({...FULL_MODULE_PERMS})}
                          className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                        >
                          تحديد الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewUserModules({...EMPTY_MODULE_PERMS})}
                          className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#102A24]/70 hover:bg-[#EEF7F0] cursor-pointer"
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {MODULE_PERM_KEYS.map((modKey) => (
                        <label
                          key={modKey}
                          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-[#102A24] border border-[#167764]/10 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={newUserModules[modKey]}
                            onChange={(e) =>
                              setNewUserModules((prev) => ({
                                ...prev,
                                [modKey]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 accent-[#167764]"
                          />
                          <span>{MODULE_PERM_LABELS_AR[modKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 7 Independent Granular Action Permissions (Default: All False) */}
                  <div className="rounded-2xl border border-[#167764]/15 bg-[#F7FAF8] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#0F4F42]">
                        ٢. الصلاحيات الإجرائية التفصيلية للمدير (افتراضياً: بدون صلاحيات):
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewUserGranular({...FULL_GRANULAR_PERMS})}
                          className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                        >
                          تحديد الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewUserGranular({...EMPTY_GRANULAR_PERMS})}
                          className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#102A24]/70 hover:bg-[#EEF7F0] cursor-pointer"
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {GRANULAR_PERM_KEYS.map((permKey) => (
                        <label
                          key={permKey}
                          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-[#102A24] border border-[#167764]/10 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={newUserGranular[permKey]}
                            onChange={(e) =>
                              setNewUserGranular((prev) => ({
                                ...prev,
                                [permKey]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 accent-[#167764]"
                          />
                          <span>{GRANULAR_PERM_LABELS_AR[permKey]}</span>
                        </label>
                      ))}
                      <div
                        aria-disabled="true"
                        className="inline-flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-[#D9A436]/30 bg-[#FDFBF5] px-3 py-1.5 text-xs font-semibold text-[#0F4F42]/75"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-[#9A6F18]" aria-hidden="true" />
                          <span className="truncate">إدارة المستخدمين</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-[#9A6F18]">
                          حصري للرئيس
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={submittingAction}
                      className="min-h-[44px] rounded-xl bg-[#167764] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                    >
                      {submittingAction ? 'جارٍ الحفظ...' : 'حفظ وإنشاء حساب المدير'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateUser(false)}
                      className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-5 py-2.5 text-sm font-semibold text-[#102A24] hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              )}

              {/* Accounts List: Protected Single President + Independent Manager Cards */}
              <div className="space-y-4">
                {users.map((u) => {
                  const isPresidentRow = u.role === 'president';
                  const isEditingThis = editingManagerId === u.id;
                  const isResettingTempThis = tempPassManagerId === u.id;
                  const enabledModulesCount = MODULE_PERM_KEYS.filter(
                    (k) => u.modulePermissions?.[k],
                  ).length;
                  const enabledGranularCount = GRANULAR_PERM_KEYS.filter(
                    (k) => u.granularPermissions?.[k],
                  ).length;

                  return (
                    <article
                      key={u.id}
                      className={`rounded-2xl border bg-white p-5 space-y-4 ${
                        isPresidentRow ? 'border-[#D9A436]/45' : 'border-[#167764]/12'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-bold text-[#0F4F42]">
                              {u.fullName}
                            </h3>
                            <span
                              className={`rounded-lg px-2.5 py-0.5 text-[11px] font-bold ${
                                isPresidentRow
                                  ? 'bg-[#FDF6E4] text-[#9A6F18]'
                                  : 'bg-[#EEF7F0] text-[#0F4F42]'
                              }`}
                            >
                              {ROLE_META[u.role].labelAr}
                            </span>
                            {!isPresidentRow && u.mustChangePassword && (
                              <span className="rounded-lg bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                                بانتظار تغيير كلمة المرور المؤقتة
                              </span>
                            )}
                            {!isPresidentRow &&
                              enabledModulesCount === 0 &&
                              enabledGranularCount === 0 && (
                                <span className="rounded-lg bg-[#F7FAF8] border border-[#167764]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#102A24]/70">
                                  بدون صلاحيات مفعّلة بعد
                                </span>
                              )}
                          </div>
                          <p className="mt-1 text-xs text-[#102A24]/70">
                            {u.boardPosition ? `${u.boardPosition} · ` : ''}
                            <span dir="ltr">@{u.username}</span> ·{' '}
                            <span dir="ltr">{u.email}</span>
                            {u.phone ? (
                              <>
                                {' '}
                                · <span dir="ltr">{u.phone}</span>
                              </>
                            ) : null}{' '}
                            ·{' '}
                            <span
                              className={
                                u.isActive
                                  ? 'text-[#32764C] font-semibold'
                                  : 'text-red-700 font-semibold'
                              }
                            >
                              {u.isActive ? 'نشط' : 'موقوف'}
                            </span>
                          </p>
                        </div>

                        {!isPresidentRow && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditManager(u)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 py-1.5 text-xs font-semibold text-[#0F4F42] hover:bg-[#EEF7F0] whitespace-nowrap cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5 shrink-0 text-[#167764]" aria-hidden="true" />
                              <span>{isEditingThis ? 'إغلاق التعديل' : 'تعديل البيانات'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (isResettingTempThis) {
                                  setTempPassManagerId(null);
                                  setTempPassValue('');
                                } else {
                                  setEditingManagerId(null);
                                  setTempPassManagerId(u.id);
                                  setTempPassValue('');
                                }
                              }}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D9A436]/35 bg-[#FDFBF5] px-3 py-1.5 text-xs font-semibold text-[#0F4F42] hover:bg-[#FDF6E4] whitespace-nowrap cursor-pointer"
                            >
                              <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#9A6F18]" aria-hidden="true" />
                              <span>{isResettingTempThis ? 'إلغاء' : 'كلمة مرور مؤقتة'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (u.isActive) {
                                  setConfirmToggleUser(u);
                                } else {
                                  void handleUpdateUser(u.id, {isActive: true});
                                }
                              }}
                              className={`min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                                u.isActive
                                  ? 'border-amber-300 bg-white text-amber-900 hover:bg-amber-50'
                                  : 'border-[#167764]/25 bg-[#EEF7F0] text-[#0F4F42] hover:bg-[#dff0e3]'
                              }`}
                            >
                              {u.isActive ? 'تعطيل الحساب' : 'إعادة تفعيل'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUser(u)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>حذف الحساب</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Edit Manager Basic Details Form */}
                      {!isPresidentRow && isEditingThis && (
                        <form
                          onSubmit={(e) => handleSaveManagerDetails(e, u.id)}
                          className="rounded-2xl border border-[#167764]/20 bg-[#F7FAF8] p-4 space-y-3"
                        >
                          <p className="text-xs font-bold text-[#0F4F42]">
                            تعديل البيانات الأساسية للمدير (@{u.username})
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-[#0F4F42]">
                                الاسم الكامل
                              </label>
                              <input
                                type="text"
                                required
                                value={editMgrFullName}
                                onChange={(e) => setEditMgrFullName(e.target.value)}
                                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#0F4F42]">
                                البريد الإلكتروني
                              </label>
                              <input
                                type="email"
                                required
                                dir="ltr"
                                value={editMgrEmail}
                                onChange={(e) => setEditMgrEmail(e.target.value)}
                                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-left text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#0F4F42]">
                                رقم الهاتف
                              </label>
                              <input
                                type="tel"
                                dir="ltr"
                                value={editMgrPhone}
                                onChange={(e) => setEditMgrPhone(e.target.value)}
                                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-left text-sm tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#0F4F42]">
                                الصفة / المسمى الإداري
                              </label>
                              <input
                                type="text"
                                value={editMgrBoardPosition}
                                onChange={(e) => setEditMgrBoardPosition(e.target.value)}
                                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingManagerId(null)}
                              className="min-h-[40px] rounded-xl border border-[#167764]/20 bg-white px-4 text-xs font-semibold cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="submit"
                              disabled={submittingAction}
                              className="min-h-[40px] rounded-xl bg-[#167764] px-4 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                            >
                              {submittingAction ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Inline Issue Temporary Password Form */}
                      {!isPresidentRow && isResettingTempThis && (
                        <form
                          onSubmit={(e) => handleResetTempPassword(e, u)}
                          className="rounded-2xl border border-[#D9A436]/35 bg-[#FDFBF5] p-4 space-y-3"
                        >
                          <p className="text-xs font-bold text-[#0F4F42]">
                            إصدار كلمة مرور مؤقتة جديدة للمدير «{u.fullName}»
                          </p>
                          <p className="text-[11px] leading-5 text-[#102A24]/75">
                            سيتم إبطال أي جلسة نشطة للمدير فوراً وإجباره خادمياً على تعيين كلمة مرور
                            شخصية جديدة عند تسجيل الدخول القادم. لا تُخزَّن كلمة المرور كنص واضح ولا
                            تظهر في سجل التدقيق.
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                              <input
                                type={showTempPassValue ? 'text' : 'password'}
                                required
                                minLength={8}
                                autoComplete="new-password"
                                value={tempPassValue}
                                onChange={(e) => setTempPassValue(e.target.value)}
                                placeholder="أدخل كلمة مرور مؤقتة جديدة (٨ أحرف على الأقل)"
                                className="min-h-[42px] w-full rounded-xl border border-[#167764]/20 bg-white py-2 pr-3 pl-11 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowTempPassValue((p) => !p)}
                                aria-label={showTempPassValue ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                className="absolute top-1/2 left-1 flex min-h-[38px] min-w-[38px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] cursor-pointer"
                              >
                                {showTempPassValue ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            <button
                              type="submit"
                              disabled={submittingAction}
                              className="min-h-[42px] rounded-xl bg-[#167764] px-4 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                            >
                              {submittingAction ? 'جارٍ الإصدار...' : 'تعيين كلمة المرور المؤقتة'}
                            </button>
                          </div>
                        </form>
                      )}

                      {isPresidentRow ? (
                        <div className="flex items-start gap-2.5 rounded-2xl border border-[#D9A436]/30 bg-[#FDFBF5] px-4 py-3 text-xs leading-6 text-[#0F4F42]">
                          <ShieldCheck
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6F18]"
                            aria-hidden="true"
                          />
                          <span>
                            حساب <strong>رئيس مجلس الإدارة الأساسي والوحيد</strong> — يمتلك كافة
                            الصلاحيات الكاملة بما في ذلك <strong>إدارة المستخدمين</strong> والاعتماد
                            المالي النهائي، وهو محمي خادمياً ضد التعديل أو التعطيل أو الحذف بواسطة أي
                            مدير.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-3 border-t border-[#167764]/10 pt-4">
                          {/* Module Access Matrix */}
                          <div className="rounded-2xl border border-[#167764]/10 bg-[#F7FAF8] p-3.5 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold text-[#0F4F42]">
                                الأقسام المصرّح بها ({formatInteger(enabledModulesCount)} من{' '}
                                {formatInteger(MODULE_PERM_KEYS.length)}):
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateUser(u.id, {
                                      modulePermissions: {...FULL_MODULE_PERMS},
                                    })
                                  }
                                  className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                                >
                                  تفعيل كل الأقسام
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateUser(u.id, {
                                      modulePermissions: {...EMPTY_MODULE_PERMS},
                                    })
                                  }
                                  className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#102A24]/70 hover:bg-[#EEF7F0] cursor-pointer"
                                >
                                  سحب كل الأقسام
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                              {MODULE_PERM_KEYS.map((modKey) => (
                                <label
                                  key={modKey}
                                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-[#102A24] border border-[#167764]/10 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(u.modulePermissions?.[modKey])}
                                    onChange={(e) =>
                                      void handleUpdateUser(u.id, {
                                        modulePermissions: {
                                          ...u.modulePermissions,
                                          [modKey]: e.target.checked,
                                        },
                                      })
                                    }
                                    className="h-4 w-4 accent-[#167764]"
                                  />
                                  <span className="truncate">{MODULE_PERM_LABELS_AR[modKey]}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Independent Granular Action Permissions Matrix + Locked User Management */}
                          <div className="rounded-2xl border border-[#167764]/10 bg-[#F7FAF8] p-3.5 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold text-[#0F4F42]">
                                الصلاحيات الإجرائية التفصيلية ({formatInteger(enabledGranularCount)}{' '}
                                من {formatInteger(GRANULAR_PERM_KEYS.length)}):
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateUser(u.id, {
                                      granularPermissions: {...FULL_GRANULAR_PERMS},
                                    })
                                  }
                                  className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#167764] hover:bg-[#EEF7F0] cursor-pointer"
                                >
                                  تفعيل كل الصلاحيات
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateUser(u.id, {
                                      granularPermissions: {...EMPTY_GRANULAR_PERMS},
                                    })
                                  }
                                  className="rounded-lg border border-[#167764]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#102A24]/70 hover:bg-[#EEF7F0] cursor-pointer"
                                >
                                  سحب كل الصلاحيات
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                              {GRANULAR_PERM_KEYS.map((permKey) => (
                                <label
                                  key={permKey}
                                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-[#102A24] border border-[#167764]/10 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(u.granularPermissions?.[permKey])}
                                    onChange={(e) =>
                                      void handleUpdateUser(u.id, {
                                        granularPermissions: {
                                          ...u.granularPermissions,
                                          [permKey]: e.target.checked,
                                        },
                                      })
                                    }
                                    className="h-4 w-4 accent-[#167764]"
                                  />
                                  <span className="truncate">
                                    {GRANULAR_PERM_LABELS_AR[permKey]}
                                  </span>
                                </label>
                              ))}
                              <div
                                aria-disabled="true"
                                className="inline-flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-[#D9A436]/30 bg-[#FDFBF5] px-2.5 py-1 text-xs font-semibold text-[#0F4F42]/75"
                              >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-[#9A6F18]" aria-hidden="true" />
                                  <span className="truncate">إدارة المستخدمين</span>
                                </span>
                                <span className="shrink-0 text-[10px] font-bold text-[#9A6F18]">
                                  للرئيس فقط
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODULE 13B: IMMUTABLE SECURITY & AUDIT LOGS */}
          {activeTab === 'security' && permissions.canViewSecurityLogs && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
                  سجل الأمان والتدقيق غير القابل للتعديل
                </h2>
                <p className="text-sm text-[#102A24]/70">
                  توثيق تلقائي لكل عملية دخول، تحديث صلاحيات، كشف رقم قومي، قيد مالي، اعتماد أو
                  تنفيذ صرف، ونسخ احتياطي.
                </p>
              </div>

              <section className="rounded-3xl border border-[#167764]/12 bg-white p-6">
                {securityLogs.length === 0 ? (
                  <p className="text-sm text-[#102A24]/65">لا توجد أحداث مسجلة حتى الآن.</p>
                ) : (
                  <div className="divide-y divide-[#167764]/10">
                    {securityLogs.map((log) => (
                      <div key={log.id} className="py-3.5 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium text-[#102A24]">{log.summaryAr}</p>
                        <p className="mt-1 text-xs text-[#102A24]/60">
                          {log.actorName} ·{' '}
                          {log.actorRole === 'anonymous'
                            ? 'زائر غير مسجل'
                            : ROLE_META[log.actorRole].labelAr}{' '}
                          · {formatArabicDateTime(log.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* MODULE 13A: ORGANIZATION SETTINGS & DATABASE BACKUP */}
          {activeTab === 'settings' && permissions.canManageSettings && (
            <SettingsPanel
              onFeedback={handleFeedback}
              onSettingsUpdated={(updated) => {
                setOrgSettings(updated);
                setLogoError(false);
              }}
            />
          )}

          {/* MY PROFILE & CHANGE PASSWORD */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-3xl border border-[#167764]/12 bg-white p-6 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0F4F42]">
                    بيانات الحساب والصلاحيات الفعّالة
                  </h2>
                  <p className="mt-1 text-xs text-[#102A24]/65">{roleInfo.shortDescAr}</p>
                </div>

                <dl className="divide-y divide-[#167764]/10 text-sm">
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-[#102A24]/65">الاسم الكامل</dt>
                    <dd className="font-semibold text-[#0F4F42]">{user.fullName}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-[#102A24]/65">اسم المستخدم</dt>
                    <dd className="font-semibold text-[#0F4F42]" dir="ltr">
                      @{user.username}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-[#102A24]/65">البريد الإلكتروني</dt>
                    <dd className="font-semibold text-[#0F4F42]" dir="ltr">
                      {user.email}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-[#102A24]/65">نوع الحساب</dt>
                    <dd className="font-bold text-[#167764]">{roleInfo.labelAr}</dd>
                  </div>
                </dl>

                <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 space-y-3">
                  <p className="text-xs font-bold text-[#0F4F42] flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                    <span>الأقسام المصرّح لك بالوصول إليها</span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs">
                    {MODULE_PERM_KEYS.map((key) => {
                      const granted = Boolean(user.modulePermissions?.[key]);
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                            granted
                              ? 'bg-[#EEF7F0] text-[#0F4F42] font-semibold'
                              : 'bg-white text-[#102A24]/45'
                          }`}
                        >
                          <span className="truncate">{MODULE_PERM_LABELS_AR[key]}</span>
                          <span className="shrink-0">{granted ? 'مفعّل' : 'غير مفعّل'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#167764]/12 bg-[#F7FAF8] p-4 space-y-2">
                  <p className="text-xs font-bold text-[#0F4F42] flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                    <span>الصلاحيات الإجرائية التفصيلية الممنوحة لك</span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs">
                    {GRANULAR_PERM_KEYS.map((key) => {
                      const granted = Boolean(user.granularPermissions?.[key]);
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                            granted
                              ? 'bg-[#EEF7F0] text-[#0F4F42] font-semibold'
                              : 'bg-white text-[#102A24]/45'
                          }`}
                        >
                          <span>{GRANULAR_PERM_LABELS_AR[key]}</span>
                          <span>{granted ? 'مفعّلة' : 'غير مفعّلة'}</span>
                        </div>
                      );
                    })}
                    <div
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                        permissions.canManageUsers
                          ? 'bg-[#FDF6E4] text-[#9A6F18] font-bold'
                          : 'bg-white text-[#102A24]/45'
                      }`}
                    >
                      <span>إدارة المستخدمين</span>
                      <span>{permissions.canManageUsers ? 'مفعّلة (حصري)' : 'حصري للرئيس'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <form
                onSubmit={handleChangePassword}
                className="rounded-3xl border border-[#167764]/12 bg-white p-6 space-y-4 self-start"
              >
                <h2 className="font-display text-lg font-bold text-[#0F4F42]">
                  تغيير كلمة المرور
                </h2>

                <div>
                  <label className="block text-sm font-semibold text-[#0F4F42]">
                    كلمة المرور الحالية
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showCurrPass ? 'text' : 'password'}
                      required
                      value={currPass}
                      onChange={(e) => setCurrPass(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-2.5 pr-4 pl-14 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrPass((p) => !p)}
                      aria-label={showCurrPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] cursor-pointer"
                    >
                      {showCurrPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#0F4F42]">
                    كلمة المرور الجديدة (٨ أحرف على الأقل)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showNextPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={nextPass}
                      onChange={(e) => setNextPass(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] py-2.5 pr-4 pl-14 text-sm focus:border-[#167764] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNextPass((p) => !p)}
                      aria-label={showNextPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute top-1/2 left-1.5 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#167764] cursor-pointer"
                    >
                      {showNextPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingAction}
                  className="min-h-[48px] w-full rounded-xl bg-[#167764] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0F4F42] disabled:opacity-60 cursor-pointer"
                >
                  {submittingAction ? 'جارٍ التحديث...' : 'حفظ كلمة المرور الجديدة'}
                </button>
              </form>
            </div>
          )}
          {/* MODULE: INSTALL APP GUIDE (تثبيت تطبيق أبواب الخير) */}
          {activeTab === 'install' && (
            <InstallAppPage embedded isAuthenticated />
          )}
        </main>
      </div>

      {/* Confirm Disable Manager Account Dialog */}
      <ConfirmDialog
        open={Boolean(confirmToggleUser)}
        titleAr="تأكيد تعطيل حساب المدير"
        messageAr={
          confirmToggleUser
            ? `هل ترغب في تعطيل حساب المدير «${confirmToggleUser.fullName}» (@${confirmToggleUser.username})؟ لن يتمكن من تسجيل الدخول لحين إعادة تفعيل الحساب.`
            : ''
        }
        confirmLabelAr="تعطيل الحساب"
        tone="danger"
        onCancel={() => setConfirmToggleUser(null)}
        onConfirm={() => {
          if (confirmToggleUser) {
            void handleUpdateUser(confirmToggleUser.id, {isActive: false});
            setConfirmToggleUser(null);
          }
        }}
      />

      {/* Confirm Permanent Delete Manager Account Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteUser)}
        titleAr="تأكيد حذف حساب المدير نهائياً"
        messageAr={
          confirmDeleteUser
            ? `هل أنت متأكد من حذف حساب المدير «${confirmDeleteUser.fullName}» (@${confirmDeleteUser.username}) نهائياً؟ سيتم إلغاء صلاحيات الدخول فوراً مع الاحتفاظ الكامل بسجلات التدقيق والعمليات المالية والتاريخية.`
            : ''
        }
        confirmLabelAr="حذف الحساب نهائياً"
        tone="danger"
        onCancel={() => setConfirmDeleteUser(null)}
        onConfirm={() => {
          if (confirmDeleteUser) {
            const target = confirmDeleteUser;
            setConfirmDeleteUser(null);
            void handleDeleteUser(target);
          }
        }}
      />

      {/* Mobile Fixed Bottom Navigation Bar (Compact 64px, Thumb-Friendly) */}
      <nav
        aria-label="التنقل السريع للجوال"
        className="fixed right-0 bottom-0 left-0 z-30 border-t border-[#167764]/12 bg-white/95 backdrop-blur-md lg:hidden"
      >
        <div className="grid h-16 grid-cols-4 items-center">
          {mobileBottomItems.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer ${
                  isActive ? 'text-[#167764]' : 'text-[#102A24]/60'
                }`}
              >
                {item.icon}
                <span className="truncate max-w-[76px]">{item.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#102A24]/65 cursor-pointer"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>الأقسام</span>
            {notifications.length > 0 && (
              <span className="absolute top-2 left-5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D9A436] px-1 text-[9px] font-bold text-white tabular-nums">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      <OfflineBanner />
    </div>
  );
}
