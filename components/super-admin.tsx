'use client';

import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Users, Store, Activity, Settings, TrendingUp, Box, Shield,
  Sun, Moon, Search, Filter, Plus, DollarSign, Smartphone, Bell, LifeBuoy,
  ChevronRight, MoreVertical, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Clock, Eye, Ban, RotateCcw, Send, MessageSquare, Mail, KeyRound,
  Zap, Server, Database, Wifi, WifiOff, UserX, UserCheck, MailOpen,
  Flag, HeartPulse, BarChart3, CalendarDays, Lock, Unlock, Trash2,
  ExternalLink, Download, Copy, Check, ArrowUpRight, Monitor, Tablet, Phone,
  AlertCircle, Info, X, CheckCheck, CircleDot, Reply, Tag, FolderOpen,
  ShieldCheck, ShieldAlert, Ticket, MessageCircle, Sparkles, Power,
  Loader2, Stethoscope, Gauge, Cpu, HardDrive, Network, LogOut
} from 'lucide-react';
import { vibrate } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';

interface SuperAdminProps {
  user: any;
  setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier' | 'super_admin') => void;
  activeStaff: any;
  initialTab?: 'dashboard' | 'analytics' | 'restaurants' | 'users' | 'devices' | 'security' | 'support' | 'notifications' | 'billing' | 'admins' | 'system-health' | 'platform-settings' | 'settings';
}

function useToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') || '' : '';
}

function formatTimeAgo(dateStr: string | Date | null) {
  if (!dateStr) return 'N/A';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string | Date | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-white/5 rounded-xl ${className}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    online: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    suspended: 'bg-red-500/10 text-red-600 dark:text-red-400',
    banned: 'bg-red-500/10 text-red-600 dark:text-red-400',
    paused: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    inactive: 'bg-slate-500/10 text-slate-500',
    offline: 'bg-slate-500/10 text-slate-500',
    pending: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    on_shift: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    off_shift: 'bg-slate-500/10 text-slate-500',
    on_leave: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    open: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    resolved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    closed: 'bg-slate-500/10 text-slate-500',
    dismissed: 'bg-slate-500/10 text-slate-500',
    in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    waiting: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
    high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    info: 'bg-slate-500/10 text-slate-500',
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${colors[status] || colors.info}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-blue-500 text-white',
    info: 'bg-slate-500 text-white',
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm">{description}</p>
    </div>
  );
}

function LoadingSpinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  return <Loader2 className={`${s} animate-spin text-orange-500`} />;
}

export default function SuperAdminPage({ user, setView, activeStaff, initialTab }: SuperAdminProps) {
  const token = useToken();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'restaurants' | 'users' | 'devices' | 'security' | 'support' | 'notifications' | 'billing' | 'admins' | 'system-health' | 'platform-settings' | 'settings'>(initialTab || 'dashboard');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('krown_theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const toggleTheme = () => {
    vibrate(20);
    const next = !isDark;
    setIsDark(next);
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('krown_theme', next ? 'dark' : 'light');
  };

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ===================== DASHBOARD STATE =====================
  const [orgs, setOrgs] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);

  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // ===================== RESTAURANT STATE =====================
  const [orgSearch, setOrgSearch] = useState('');
  const [orgStatusFilter, setOrgStatusFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [orgActionLoading, setOrgActionLoading] = useState<string | null>(null);
  const [createOrgForm, setCreateOrgForm] = useState({
    name: '', contactEmail: '', contactPhone: '', taxId: '', address: '',
    branchName: '', branchLocation: '', managerName: '', managerEmail: '', managerPhone: '',
    adminName: '', adminEmail: '', adminPassword: '',
  });

  // ===================== USERS STATE =====================
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState('all');
  const [staffOrgFilter, setStaffOrgFilter] = useState('all');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [staffActionLoading, setStaffActionLoading] = useState<string | null>(null);
  const [showResetPin, setShowResetPin] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [showResetPassword, setShowResetPassword] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', password: '', role: 'cashier', organizationId: '', branchId: '' });
  const [addUserBranches, setAddUserBranches] = useState<any[]>([]);
  const [addUserLoading, setAddUserLoading] = useState(false);

  // ===================== DEVICES STATE =====================
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceStatusFilter, setDeviceStatusFilter] = useState('all');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('all');
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);

  // ===================== SECURITY STATE =====================
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('all');
  const [alertStatusFilter, setAlertStatusFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [alertActionLoading, setAlertActionLoading] = useState<string | null>(null);

  // ===================== SUPPORT STATE =====================
  const [convSearch, setConvSearch] = useState('');
  const [convStatusFilter, setConvStatusFilter] = useState('all');
  const [convPriorityFilter, setConvPriorityFilter] = useState('all');
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [convMessages, setConvMessages] = useState<any[]>([]);
  const [convMessageInput, setConvMessageInput] = useState('');
  const [convActionLoading, setConvActionLoading] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);

  // ===================== NOTIFICATIONS STATE =====================
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  // ===================== DEFAULT FALLBACKS =====================
  const DEFAULT_ANALYTICS = {
    totalRevenue: 0, totalOrders: 0, activeRestaurants: 0, totalRestaurants: 0,
    activeStaff: 0, totalStaff: 0, paidOrders: 0, pendingOrders: 0,
    revenueByDay: [], ordersByDay: [], topRestaurants: [], staffByRole: [],
  };

  const DEFAULT_BILLING = {
    summary: { mrr: 0, activeCount: 0, pastDueCount: 0 },
    plans: [], subscriptions: [],
  };

  const DEFAULT_SYSTEM_HEALTH = {
    database: { status: 'ok', latencyMs: 0, sizeFormatted: 'N/A', activeConnections: 0 },
    server: { nodeVersion: 'v20', uptime: 0, memory: { rss: 0 } },
    tables: [], recentErrors: [],
  };

  // ===================== TOAST & EXPORT STATE =====================
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const exportToCsv = (filename: string, rows: any[]) => {
    if (!rows || !rows.length) {
      showToast('No data available to export', 'error');
      return;
    }
    try {
      const separator = ',';
      const keys = Object.keys(rows[0]);
      const csvContent =
        keys.join(separator) +
        '\n' +
        rows
          .map(row => {
            return keys
              .map(k => {
                let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                cell = typeof cell === 'object' ? JSON.stringify(cell) : cell.toString();
                cell = cell.replace(/"/g, '""');
                if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
                return cell;
              })
              .join(separator);
          })
          .join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported ${filename} successfully!`);
    } catch (e: any) {
      showToast('Failed to export CSV: ' + e.message, 'error');
    }
  };

  // ===================== GLOBAL SEARCH STATE =====================
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const handleGlobalSearch = async (q: string) => {
    setGlobalSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }
    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const res = await fetch(`/api/super-admin/search?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setSearchResults(d.data || null);
      }
    } catch { /* silent */ } finally {
      setIsSearching(false);
    }
  };

  // ===================== DEVICE SETUP STATE =====================
  const [showSetupDevice, setShowSetupDevice] = useState(false);
  const [setupDeviceForm, setSetupDeviceForm] = useState({
    organizationId: '',
    deviceName: '',
    deviceType: 'pos',
    allowedRoles: ['cashier', 'waiter'],
  });
  const [generatedEnrollmentToken, setGeneratedEnrollmentToken] = useState<string | null>(null);
  const [setupDeviceLoading, setSetupDeviceLoading] = useState(false);

  const handleSetupDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupDeviceLoading(true);
    try {
      const res = await fetch('/api/devices/enrollment-token', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          organizationId: setupDeviceForm.organizationId || (orgs[0]?.id || ''),
          deviceName: setupDeviceForm.deviceName,
          deviceType: setupDeviceForm.deviceType,
          allowedRoles: setupDeviceForm.allowedRoles,
        }),
      });
      const d = await res.json();
      if (res.ok && d.data?.token) {
        setGeneratedEnrollmentToken(d.data.token);
        showToast('Device enrollment token generated successfully!');
        fetchDashboardData();
      } else {
        showToast(d.error || 'Failed to generate enrollment token', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error', 'error');
    } finally {
      setSetupDeviceLoading(false);
    }
  };

  // ===================== SETTINGS STATE =====================
  const [flagToggling, setFlagToggling] = useState<string | null>(null);

  // ===================== ANALYTICS STATE =====================
  const [analytics, setAnalytics] = useState<any>(DEFAULT_ANALYTICS);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'7' | '30' | '90'>('30');

  // ===================== BILLING STATE =====================
  const [billing, setBilling] = useState<any>(DEFAULT_BILLING);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [billingOrgFilter, setBillingOrgFilter] = useState('all');

  // ===================== ADMINS STATE =====================
  const [admins, setAdmins] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [createAdminForm, setCreateAdminForm] = useState({ name: '', email: '', password: '' });
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(null);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminActionLoading('create');
    setCreateAdminError(null);
    try {
      const res = await fetch('/api/super-admin/admins', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createAdminForm),
      });
      const d = await res.json();
      if (res.ok && d.data) {
        setAdmins(prev => [d.data, ...prev]);
        setShowCreateAdmin(false);
        setCreateAdminForm({ name: '', email: '', password: '' });
        showToast('Super Admin account created successfully!');
      } else {
        setCreateAdminError(d.error || 'Failed to create admin');
      }
    } catch (err: any) {
      setCreateAdminError(err.message || 'Network error');
    } finally {
      setAdminActionLoading(null);
    }
  };

  // ===================== SYSTEM HEALTH STATE =====================
  const [systemHealth, setSystemHealth] = useState<any>(DEFAULT_SYSTEM_HEALTH);
  const [loadingSystemHealth, setLoadingSystemHealth] = useState(true);

  // ===================== PLATFORM SETTINGS STATE =====================
  const [platformSettings, setPlatformSettings] = useState<any[]>([]);
  const [loadingPlatformSettings, setLoadingPlatformSettings] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ===================== MODALS =====================
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; action: () => void; loading?: boolean } | null>(null);

  // ===================== DATA FETCHING =====================
  const fetchDashboardData = useCallback(async () => {
    setLoadingDashboard(true);
    setError(null);
    try {
      const [orgsRes, staffRes, devicesRes, alertsRes, healthRes, flagsRes, analyticsRes] = await Promise.allSettled([
        fetch('/api/super-admin/orgs', { headers: authHeaders() }),
        fetch('/api/staff', { headers: authHeaders() }),
        fetch('/api/devices', { headers: authHeaders() }),
        fetch('/api/security/alerts?limit=50', { headers: authHeaders() }),
        fetch('/api/health', { headers: authHeaders() }),
        fetch('/api/feature-flags', { headers: authHeaders() }),
        fetch('/api/super-admin/analytics', { headers: authHeaders() }),
      ]);

      if (orgsRes.status === 'fulfilled' && orgsRes.value.ok) {
        const d = await orgsRes.value.json();
        setOrgs(d.data || []);
      }
      if (staffRes.status === 'fulfilled' && staffRes.value.ok) {
        const d = await staffRes.value.json();
        setAllStaff(d.data || []);
      }
      if (devicesRes.status === 'fulfilled' && devicesRes.value.ok) {
        const d = await devicesRes.value.json();
        setDevices(d.data || []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const d = await alertsRes.value.json();
        setAlerts(d.data || []);
      }
      if (healthRes.status === 'fulfilled') {
        const d = await healthRes.value.json();
        setHealth(d);
      }
      if (flagsRes.status === 'fulfilled' && flagsRes.value.ok) {
        const d = await flagsRes.value.json();
        setFeatureFlags(d.data || []);
      }
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        const d = await analyticsRes.value.json();
        setAnalytics(d.data);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard data');
    } finally {
      setLoadingDashboard(false);
      setLoadingOrgs(false);
      setLoadingStaff(false);
      setLoadingDevices(false);
      setLoadingAlerts(false);
      setLoadingHealth(false);
      setLoadingFlags(false);
      setLoadingAnalytics(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch('/api/audit?limit=100', { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(d.data || []);
      }
    } catch { /* silent */ } finally {
      setLoadingAudit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const res = await fetch('/api/notifications?limit=100', { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.data || []);
      }
    } catch { /* silent */ } finally {
      setLoadingNotifications(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch('/api/support/conversations?limit=100', { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setConversations(d.data || []);
      }
    } catch { /* silent */ } finally {
      setLoadingConversations(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchDashboardData(), 0);
    return () => clearTimeout(t);
  }, [fetchDashboardData]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeTab === 'dashboard') fetchDashboardData();
      else if (activeTab === 'restaurants' && orgs.length === 0) fetchDashboardData();
      else if (activeTab === 'users' && allStaff.length === 0) fetchDashboardData();
      else if (activeTab === 'devices' && devices.length === 0) fetchDashboardData();
      else if (activeTab === 'security') {
        if (alerts.length === 0) fetchDashboardData();
        if (auditLogs.length === 0) fetchAuditLogs();
      }
      else if (activeTab === 'support' && conversations.length === 0) fetchConversations();
      else if (activeTab === 'notifications' && notifications.length === 0) fetchNotifications();
      else if (activeTab === 'settings') {
        if (featureFlags.length === 0) fetchDashboardData();
        if (!health) fetchDashboardData();
      }
      else if (activeTab === 'analytics') {
        setLoadingAnalytics(true);
        fetch('/api/super-admin/analytics', { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(d => { setAnalytics(d?.data || DEFAULT_ANALYTICS); setLoadingAnalytics(false); })
          .catch(() => { setAnalytics((prev: any) => prev || DEFAULT_ANALYTICS); setLoadingAnalytics(false); });
      }
      else if (activeTab === 'billing') {
        setLoadingBilling(true);
        fetch('/api/super-admin/billing', { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(d => { setBilling(d?.data || DEFAULT_BILLING); setLoadingBilling(false); })
          .catch(() => { setBilling((prev: any) => prev || DEFAULT_BILLING); setLoadingBilling(false); });
      }
      else if (activeTab === 'admins') {
        setLoadingAdmins(true);
        fetch('/api/super-admin/admins', { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(d => { setAdmins(d?.data || []); setLoadingAdmins(false); })
          .catch(() => { setAdmins((prev: any) => prev || []); setLoadingAdmins(false); });
      }
      else if (activeTab === 'system-health') {
        setLoadingSystemHealth(true);
        fetch('/api/super-admin/system-health', { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(d => { setSystemHealth(d?.data || DEFAULT_SYSTEM_HEALTH); setLoadingSystemHealth(false); })
          .catch(() => { setSystemHealth((prev: any) => prev || DEFAULT_SYSTEM_HEALTH); setLoadingSystemHealth(false); });
      }
      else if (activeTab === 'platform-settings') {
        setLoadingPlatformSettings(true);
        fetch('/api/super-admin/platform-settings', { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(d => { setPlatformSettings(d?.data || []); setLoadingPlatformSettings(false); })
          .catch(() => { setPlatformSettings((prev: any) => prev || []); setLoadingPlatformSettings(false); });
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ===================== RESTAURANT ACTIONS =====================
  const handleSuspendOrg = async (orgId: string) => {
    setOrgActionLoading(orgId);
    try {
      const res = await fetch(`/api/super-admin/orgs/${orgId}/suspend`, {
        method: 'POST', headers: authHeaders(),
      });
      if (res.ok) {
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: 'suspended' } : o));
        showToast('Restaurant suspended successfully');
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to suspend restaurant', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setOrgActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleReactivateOrg = async (orgId: string) => {
    setOrgActionLoading(orgId);
    try {
      const res = await fetch(`/api/super-admin/orgs/${orgId}/reactivate`, {
        method: 'POST', headers: authHeaders(),
      });
      if (res.ok) {
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: 'active' } : o));
        showToast('Restaurant reactivated successfully');
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to reactivate restaurant', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setOrgActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrgForm.name.trim()) { showToast('Restaurant name is required', 'error'); return; }
    setOrgActionLoading('create');
    try {
      const res = await fetch('/api/super-admin/orgs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createOrgForm),
      });
      const d = await res.json();
      if (res.ok) {
        setShowCreateOrg(false);
        setCreateOrgForm({ name: '', contactEmail: '', contactPhone: '', taxId: '', address: '', branchName: '', branchLocation: '', managerName: '', managerEmail: '', managerPhone: '', adminName: '', adminEmail: '', adminPassword: '' });
        showToast('Restaurant created successfully!');
        fetchDashboardData();
      } else {
        showToast(d.error || 'Failed to create restaurant', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setOrgActionLoading(null);
    }
  };

  // ===================== STAFF ACTIONS =====================
  const handleStaffStatus = async (staffId: string, status: string) => {
    setStaffActionLoading(staffId);
    try {
      const res = await fetch(`/api/staff/${staffId}/status`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setAllStaff(prev => prev.map(s => s.id === staffId ? { ...s, status } : s));
        showToast(`Staff member ${status === 'active' ? 'activated' : 'suspended'} successfully`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to update staff status', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setStaffActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleResetPin = async (staffId: string) => {
    if (!newPin || newPin.length < 4) { showToast('PIN must be at least 4 digits', 'error'); return; }
    setStaffActionLoading(staffId);
    try {
      const res = await fetch(`/api/staff/${staffId}/pin`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ pin: newPin }),
      });
      if (res.ok) {
        setShowResetPin(null);
        setNewPin('');
        showToast('PIN reset successfully');
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to reset PIN', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setStaffActionLoading(null);
    }
  };

  const handleResetPassword = async (staffId: string) => {
    setStaffActionLoading(staffId);
    try {
      const newPassword = Math.random().toString(36).substring(2, 10) + 'A1!';
      const res = await fetch(`/api/super-admin/users/${staffId}/reset-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setShowResetPassword(null);
        showToast(`Password reset. New password: ${newPassword}`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to reset password', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setStaffActionLoading(null);
    }
  };

  // ===================== ADD USER ACTIONS =====================
  useEffect(() => {
    let cancelled = false;
    if (addUserForm.organizationId) {
      fetch(`/api/branches?organization_id=${addUserForm.organizationId}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : { data: [] })
        .then(d => { if (!cancelled) startTransition(() => { setAddUserBranches(d.data || d || []); }); })
        .catch(() => {});
      startTransition(() => { setAddUserForm(p => ({ ...p, branchId: '' })); });
    } else {
      startTransition(() => { setAddUserBranches([]); });
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addUserForm.organizationId]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserForm.name.trim() || !addUserForm.email.trim() || !addUserForm.password.trim()) {
      showToast('Name, email and password are required', 'error'); return;
    }
    if (!addUserForm.organizationId) {
      showToast('Please select a restaurant', 'error'); return;
    }
    setAddUserLoading(true);
    try {
      const res = await fetch('/api/super-admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: addUserForm.name.trim(),
          email: addUserForm.email.trim(),
          password: addUserForm.password,
          role: addUserForm.role,
          organizationId: addUserForm.organizationId,
          branchId: addUserForm.branchId || undefined,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setShowAddUser(false);
        setAddUserForm({ name: '', email: '', password: '', role: 'cashier', organizationId: '', branchId: '' });
        showToast('User created successfully!');
        fetchDashboardData();
      } else {
        showToast(d.error || 'Failed to create user', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error', 'error');
    } finally {
      setAddUserLoading(false);
    }
  };

  // ===================== DEVICE ACTIONS =====================
  const handleDeviceAction = async (deviceId: string, action: string) => {
    setDeviceActionLoading(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const newStatus = action === 'activate' ? 'active' : action === 'suspend' ? 'suspended' : 'revoked';
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: newStatus } : d));
        showToast(`Device ${action}d successfully`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || `Failed to ${action} device`, 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setDeviceActionLoading(null);
      setConfirmModal(null);
    }
  };

  // ===================== SECURITY ACTIONS =====================
  const handleAlertAction = async (alertId: string, status: string) => {
    setAlertActionLoading(alertId);
    try {
      const res = await fetch(`/api/security/alerts/${alertId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status } : a));
        showToast(`Alert ${status}`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to update alert', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setAlertActionLoading(null);
      setConfirmModal(null);
    }
  };

  // ===================== SUPPORT ACTIONS =====================
  const handleConvStatus = async (convId: string, status: string) => {
    setConvActionLoading(convId);
    try {
      const res = await fetch(`/api/support/conversations/${convId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, status } : c));
        showToast(`Conversation ${status}`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to update conversation', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setConvActionLoading(null);
    }
  };

  const loadConvMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/support/conversations/${convId}/messages?limit=100`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setConvMessages(d.data || []);
      }
    } catch { /* silent */ }
  };

  const handleSendConvMessage = async (convId: string) => {
    if (!convMessageInput.trim()) return;
    const msg = convMessageInput.trim();
    setConvMessageInput('');
    try {
      const res = await fetch(`/api/support/conversations/${convId}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: msg, sender_type: 'agent' }),
      });
      if (res.ok) {
        const d = await res.json();
        setConvMessages(prev => [...prev, d.data]);
      }
    } catch { /* silent */ }
  };

  const handleAiQuery = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiResponse('');
    try {
      const res = await fetch('/api/support/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiQuery.trim() }),
      });
      const d = await res.json();
      if (d.data?.answer) setAiResponse(d.data.answer);
      else if (d.error) setAiResponse(d.error);
      else setAiResponse('No response');
    } catch { setAiResponse('Failed to get AI response.'); }
    finally { setAiLoading(false); }
  };

  // ===================== NOTIFICATION ACTIONS =====================
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        showToast('All notifications marked as read');
      } else {
        showToast('Failed to mark notifications', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
  };

  // ===================== FEATURE FLAG ACTIONS =====================
  const handleToggleFlag = async (flagKey: string) => {
    setFlagToggling(flagKey);
    try {
      const flag = featureFlags.find(f => f.key === flagKey);
      const res = await fetch('/api/feature-flags', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ key: flagKey, enabled: !flag?.enabled }),
      });
      if (res.ok) {
        setFeatureFlags(prev => prev.map(f => f.key === flagKey ? { ...f, enabled: !f.enabled } : f));
        showToast(`Feature flag "${flagKey}" ${flag?.enabled ? 'disabled' : 'enabled'}`);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Failed to toggle feature flag', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); } finally {
      setFlagToggling(null);
    }
  };

  // ===================== FILTERED DATA =====================
  const filteredOrgs = orgs.filter(o => {
    if (orgSearch && !o.name?.toLowerCase().includes(orgSearch.toLowerCase()) && !o.contact_email?.toLowerCase().includes(orgSearch.toLowerCase())) return false;
    if (orgStatusFilter !== 'all' && o.status !== orgStatusFilter) return false;
    return true;
  });

  const filteredStaff = allStaff.filter(s => {
    if (staffSearch && !s.name?.toLowerCase().includes(staffSearch.toLowerCase()) && !s.email?.toLowerCase().includes(staffSearch.toLowerCase())) return false;
    if (staffRoleFilter !== 'all' && s.role !== staffRoleFilter) return false;
    if (staffStatusFilter !== 'all' && s.status !== staffStatusFilter) return false;
    if (staffOrgFilter !== 'all' && s.organization_id !== staffOrgFilter) return false;
    return true;
  });

  const filteredDevices = devices.filter(d => {
    if (deviceSearch && !d.device_name?.toLowerCase().includes(deviceSearch.toLowerCase())) return false;
    if (deviceStatusFilter !== 'all' && d.status !== deviceStatusFilter) return false;
    if (deviceTypeFilter !== 'all' && d.device_type !== deviceTypeFilter) return false;
    return true;
  });

  const filteredAlerts = alerts.filter(a => {
    if (alertSeverityFilter !== 'all' && a.severity !== alertSeverityFilter) return false;
    if (alertStatusFilter !== 'all' && a.status !== alertStatusFilter) return false;
    return true;
  });

  const filteredAuditLogs = auditLogs.filter(l => {
    if (auditSearch && !l.action?.toLowerCase().includes(auditSearch.toLowerCase()) && !l.actor_email?.toLowerCase().includes(auditSearch.toLowerCase())) return false;
    return true;
  });

  const filteredConversations = conversations.filter(c => {
    if (convSearch && !c.subject?.toLowerCase().includes(convSearch.toLowerCase())) return false;
    if (convStatusFilter !== 'all' && c.status !== convStatusFilter) return false;
    if (convPriorityFilter !== 'all' && c.priority !== convPriorityFilter) return false;
    return true;
  });

  const filteredNotifications = notifications.filter(n => {
    if (notifFilter === 'unread' && n.is_read) return false;
    return true;
  });

  // ===================== DASHBOARD METRICS =====================
  const totalOrgs = orgs.length;
  const activeOrgs = orgs.filter(o => o.status === 'active').length;
  const totalStaffCount = allStaff.length;
  const activeStaffCount = allStaff.filter(s => s.status === 'active' || s.status === 'on_shift').length;
  const totalDevices = devices.length;
  const activeDevices = devices.filter(d => d.status === 'active').length;
  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const openConversations = conversations.filter(c => c.status === 'open').length;
  const unreadNotifications = notifications.filter(n => !n.is_read).length;

  // Chart data - derive from recent audit logs
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activityTrend = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const dayLogs = auditLogs.filter(l => {
      const t = new Date(l.created_at).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    return { day: daysOfWeek[d.getDay()], events: dayLogs.length };
  });

  const orgStatusData = [
    { name: 'Active', value: activeOrgs, fill: '#10b981' },
    { name: 'Suspended', value: totalOrgs - activeOrgs, fill: '#ef4444' },
  ];

  // ===================== SIDEBAR TABS =====================
  const tabs = [
    { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
    { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
    { id: 'restaurants', icon: Store, label: 'Restaurants' },
    { id: 'users', icon: Users, label: 'Users' },
    { id: 'devices', icon: Smartphone, label: 'Devices' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'support', icon: LifeBuoy, label: 'Support' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'billing', icon: DollarSign, label: 'Billing' },
    { id: 'admins', icon: UserCheck, label: 'Admins' },
    { id: 'system-health', icon: Stethoscope, label: 'System' },
    { id: 'platform-settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-6 lg:p-10 font-sans flex flex-col lg:flex-row">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="w-full lg:w-64 flex flex-col gap-2 pr-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-black/5 dark:border-white/5 pb-6 lg:pb-0 mb-6 lg:mb-0 mr-0 lg:mr-8 shrink-0">
        <div className="flex items-center justify-between lg:justify-start gap-3 mb-6 lg:mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-slate-900 dark:text-white text-lg">KROWN SUPER</h1>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Super Admin Control Center</p>
            </div>
          </div>
          <button onClick={toggleTheme} className="lg:hidden text-slate-500 p-2">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }} className="lg:hidden text-red-400 p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-row lg:flex-col gap-1 flex-1 overflow-x-auto lg:overflow-y-auto custom-scrollbar pb-2 lg:pb-0">
          {tabs.map(tab => {
            const badge = tab.id === 'security' ? openAlerts : tab.id === 'support' ? openConversations : tab.id === 'notifications' ? unreadNotifications : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => { vibrate(20); setActiveTab(tab.id as any); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-medium transition-all shrink-0 text-sm relative ${
                  activeTab === tab.id
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden lg:flex flex-col gap-2 pt-4">
          <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            Toggle Theme
          </button>
          <button onClick={() => { vibrate(30); setView('admin' as any); }} className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm">
            <ChevronLeft className="w-4 h-4" />
            Back to Admin
          </button>
          <button onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }} className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-red-400 hover:text-red-600 hover:bg-red-500/5 dark:hover:text-red-400 dark:hover:bg-red-500/5 transition-all text-sm">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 min-w-0 flex flex-col h-[calc(100vh-5rem)]">
        {/* Top Header with Global Search */}
        <header className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 p-4 rounded-2xl mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm relative">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                {totalOrgs} organizations &middot; {totalStaffCount} staff &middot; {totalDevices} devices
              </p>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 max-w-md w-full">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={e => handleGlobalSearch(e.target.value)}
                onFocus={() => globalSearchQuery.length >= 2 && setShowSearchResults(true)}
                placeholder="Search restaurants, staff, devices, orders, alerts..."
                className="w-full bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 absolute right-3 top-1/2 -translate-y-1/2" />
              ) : globalSearchQuery ? (
                <button onClick={() => { setGlobalSearchQuery(''); setSearchResults(null); setShowSearchResults(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {/* Live Search Dropdown */}
            {showSearchResults && searchResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 p-4 max-h-96 overflow-y-auto custom-scrollbar space-y-4">
                {/* Restaurants */}
                {searchResults.restaurants?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Store className="w-3 h-3 text-orange-500" /> Restaurants</p>
                    <div className="space-y-1">
                      {searchResults.restaurants.map((r: any) => (
                        <div key={r.id} onClick={() => { setActiveTab('restaurants'); setSelectedOrg(r); setShowSearchResults(false); }} className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-900 dark:text-white">{r.name}</span>
                          <span className="text-[10px] text-slate-400">{r.contact_email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Users */}
                {searchResults.users?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users className="w-3 h-3 text-blue-500" /> Users</p>
                    <div className="space-y-1">
                      {searchResults.users.map((u: any) => (
                        <div key={u.id} onClick={() => { setActiveTab('users'); setSelectedStaff(u); setShowSearchResults(false); }} className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">{u.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">({u.role})</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{u.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Devices */}
                {searchResults.devices?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone className="w-3 h-3 text-purple-500" /> Devices</p>
                    <div className="space-y-1">
                      {searchResults.devices.map((d: any) => (
                        <div key={d.id} onClick={() => { setActiveTab('devices'); setShowSearchResults(false); }} className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-900 dark:text-white">{d.device_name}</span>
                          <StatusBadge status={d.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts */}
                {searchResults.alerts?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Shield className="w-3 h-3 text-red-500" /> Security Alerts</p>
                    <div className="space-y-1">
                      {searchResults.alerts.map((a: any) => (
                        <div key={a.id} onClick={() => { setActiveTab('security'); setShowSearchResults(false); }} className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-900 dark:text-white">{a.title}</span>
                          <SeverityBadge severity={a.severity} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!searchResults.restaurants?.length && !searchResults.users?.length && !searchResults.devices?.length && !searchResults.alerts?.length) && (
                  <p className="text-xs text-slate-500 text-center py-4">No results found for &quot;{globalSearchQuery}&quot;</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {health && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${health.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                <div className={`w-2 h-2 rounded-full ${health.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                System {health.status === 'healthy' ? 'Healthy' : 'Degraded'}
              </div>
            )}
            <button
              onClick={() => { vibrate(20); fetchDashboardData(); }}
              className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </header>

        {/* Tab Content */}
        <AnimatePresence mode="wait">

          {/* ======================== DASHBOARD TAB ======================== */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-orange-500 to-amber-500 shadow-2xl shadow-orange-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Store className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Restaurants</span>
                  </div>
                  {loadingDashboard ? <Skeleton className="h-8 w-20 bg-white/20" /> : (
                    <>
                      <h3 className="text-3xl font-extrabold">{totalOrgs}</h3>
                      <p className="text-[10px] text-white/80 mt-1 font-medium">{activeOrgs} active organizations</p>
                    </>
                  )}
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl shadow-blue-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Users className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Active Users</span>
                  </div>
                  {loadingDashboard ? <Skeleton className="h-8 w-20 bg-white/20" /> : (
                    <>
                      <h3 className="text-3xl font-extrabold">{activeStaffCount}</h3>
                      <p className="text-[10px] text-white/80 mt-1 font-medium">{totalStaffCount} total staff across all orgs</p>
                    </>
                  )}
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-2xl shadow-emerald-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Smartphone className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Active Devices</span>
                  </div>
                  {loadingDashboard ? <Skeleton className="h-8 w-20 bg-white/20" /> : (
                    <>
                      <h3 className="text-3xl font-extrabold">{activeDevices}</h3>
                      <p className="text-[10px] text-white/80 mt-1 font-medium">{totalDevices} total registered devices</p>
                    </>
                  )}
                </div>

                <div className="bg-gradient-to-br from-red-500 to-rose-600 shadow-2xl shadow-red-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Security Alerts</span>
                  </div>
                  {loadingDashboard ? <Skeleton className="h-8 w-20 bg-white/20" /> : (
                    <>
                      <h3 className="text-3xl font-extrabold">{openAlerts}</h3>
                      <p className="text-[10px] text-white/80 mt-1 font-medium">Open alerts requiring attention</p>
                    </>
                  )}
                </div>

                <div className="bg-gradient-to-br from-purple-500 to-violet-600 shadow-2xl shadow-purple-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Ticket className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Support Tickets</span>
                  </div>
                  {loadingDashboard ? <Skeleton className="h-8 w-20 bg-white/20" /> : (
                    <>
                      <h3 className="text-3xl font-extrabold">{openConversations}</h3>
                      <p className="text-[10px] text-white/80 mt-1 font-medium">Open support conversations</p>
                    </>
                  )}
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Activity Trend */}
                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Platform Activity (7 Days)</h3>
                  <div className="h-[240px] w-full">
                    {loadingDashboard ? <Skeleton className="h-full w-full" /> : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityTrend}>
                          <defs>
                            <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip />
                          <Area type="monotone" dataKey="events" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorEvents)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* System Health */}
                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">System Health</h3>
                  {loadingHealth || !health ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`flex items-center justify-between p-4 rounded-2xl border ${health.status === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                        <div className="flex items-center gap-3">
                          <HeartPulse className={`w-5 h-5 ${health.status === 'healthy' ? 'text-emerald-500' : 'text-red-500'}`} />
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Overall Status</p>
                            <p className="text-xs text-slate-500">Last checked: {formatDateTime(health.timestamp)}</p>
                          </div>
                        </div>
                        <StatusBadge status={health.status === 'healthy' ? 'active' : 'suspended'} />
                      </div>

                      {Object.entries(health.checks || {}).map(([key, check]: [string, any]) => (
                        <div key={key} className={`flex items-center justify-between p-4 rounded-2xl border ${check.status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                          <div className="flex items-center gap-3">
                            {key === 'database' ? <Database className={`w-5 h-5 ${check.status === 'ok' ? 'text-emerald-500' : 'text-red-500'}`} /> :
                             key === 'redis' ? <Server className={`w-5 h-5 ${check.status === 'ok' ? 'text-emerald-500' : 'text-red-500'}`} /> :
                             <Cpu className={`w-5 h-5 ${check.status === 'ok' ? 'text-emerald-500' : 'text-red-500'}`} />}
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{key}</p>
                              {check.latencyMs !== undefined && <p className="text-xs text-slate-500">Latency: {check.latencyMs}ms</p>}
                              {check.error && <p className="text-xs text-red-500">{check.error}</p>}
                            </div>
                          </div>
                          {check.status === 'ok' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Activity</h3>
                {loadingAudit ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : auditLogs.length === 0 ? (
                  <EmptyState icon={Activity} title="No Activity" description="No audit events recorded yet." />
                ) : (
                  <div className="space-y-2">
                    {auditLogs.slice(0, 10).map((log: any) => (
                      <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                          {log.action?.includes('LOGIN') ? <Lock className="w-4 h-4 text-orange-500" /> :
                           log.action?.includes('CREATE') ? <Plus className="w-4 h-4 text-emerald-500" /> :
                           log.action?.includes('UPDATE') ? <RefreshCw className="w-4 h-4 text-blue-500" /> :
                           log.action?.includes('DELETE') ? <Trash2 className="w-4 h-4 text-red-500" /> :
                           <Activity className="w-4 h-4 text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{log.action}</p>
                          <p className="text-[11px] text-slate-500">{log.actor_email || log.staff_id || 'System'}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatTimeAgo(log.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ======================== RESTAURANTS TAB ======================== */}
          {activeTab === 'restaurants' && (
            <motion.div key="restaurants" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Restaurants</h2>
                  <p className="text-slate-500 font-medium text-xs">Manage all tenant organizations on the platform.</p>
                </div>
                <button
                  onClick={() => setShowCreateOrg(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-xs shrink-0"
                >
                  <Plus className="w-4 h-4" /> Create Restaurant
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={orgSearch}
                    onChange={e => setOrgSearch(e.target.value)}
                    placeholder="Search restaurants..."
                    className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <select
                  value={orgStatusFilter}
                  onChange={e => setOrgStatusFilter(e.target.value)}
                  className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {/* Table */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                {loadingOrgs ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : filteredOrgs.length === 0 ? (
                  <EmptyState icon={Store} title="No Restaurants Found" description="Create your first restaurant organization to get started." />
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-black/5 dark:border-white/5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-4 px-6">Restaurant</th>
                          <th className="py-4 px-6">Status</th>
                          <th className="py-4 px-6">Branches</th>
                          <th className="py-4 px-6">Staff</th>
                          <th className="py-4 px-6">Plan</th>
                          <th className="py-4 px-6">Created</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/5">
                        {filteredOrgs.map((org: any) => (
                          <tr key={org.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                                  {org.name?.charAt(0)?.toUpperCase() || 'R'}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 dark:text-white text-sm">{org.name}</p>
                                  <p className="text-[11px] text-slate-500">{org.contact_email || 'No email'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6"><StatusBadge status={org.status || 'active'} /></td>
                            <td className="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-slate-300">{org.branch_count || 0}</td>
                            <td className="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-slate-300">{org.staff_count || 0}</td>
                            <td className="py-4 px-6">
                              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{org.plan_name || 'Free'}</span>
                            </td>
                            <td className="py-4 px-6 text-xs text-slate-500">{formatDate(org.created_at)}</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => setSelectedOrg(selectedOrg?.id === org.id ? null : org)}
                                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4 text-slate-400" />
                                </button>
                                {org.status === 'active' ? (
                                  <button
                                    onClick={() => setConfirmModal({
                                      title: 'Suspend Restaurant',
                                      message: `Are you sure you want to suspend "${org.name}"? This will pause all staff accounts and cancel the subscription.`,
                                      action: () => handleSuspendOrg(org.id),
                                    })}
                                    disabled={orgActionLoading === org.id}
                                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:opacity-50"
                                    title="Suspend"
                                  >
                                    {orgActionLoading === org.id ? <LoadingSpinner size="sm" /> : <Ban className="w-4 h-4 text-red-500" />}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivateOrg(org.id)}
                                    disabled={orgActionLoading === org.id}
                                    className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                                    title="Reactivate"
                                  >
                                    {orgActionLoading === org.id ? <LoadingSpinner size="sm" /> : <RotateCcw className="w-4 h-4 text-emerald-500" />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Org Detail Panel */}
              <AnimatePresence>
                {selectedOrg && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedOrg.name} — Details</h3>
                        <button onClick={() => setSelectedOrg(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-4 h-4 text-slate-400" /></button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Organization ID</p>
                          <p className="text-xs font-mono text-slate-700 dark:text-slate-300 mt-1 break-all">{selectedOrg.id}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Slug</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.slug || 'N/A'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Contact Email</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.contact_email || 'N/A'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Phone</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.contact_phone || 'N/A'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Tax ID</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.tax_id || 'N/A'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Subscription</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.subscription_status || 'None'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Branches</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.branch_count || 0}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Staff Count</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selectedOrg.staff_count || 0}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ======================== USERS TAB ======================== */}
          {activeTab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Users</h2>
                  <p className="text-slate-500 font-medium text-xs">Search and manage all staff across restaurants.</p>
                </div>
                <button
                  onClick={() => {
                    if (orgs.length > 0 && !addUserForm.organizationId) {
                      setAddUserForm(p => ({ ...p, organizationId: orgs[0].id }));
                    }
                    setShowAddUser(true);
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add User
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <select value={staffRoleFilter} onChange={e => setStaffRoleFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                  <option value="all">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="senior_waiter">Senior Waiter</option>
                  <option value="head_chef">Head Chef</option>
                  <option value="kitchen_staff">Kitchen Staff</option>
                </select>
                <select value={staffStatusFilter} onChange={e => setStaffStatusFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="banned">Banned</option>
                  <option value="on_shift">On Shift</option>
                  <option value="off_shift">Off Shift</option>
                </select>
                <select value={staffOrgFilter} onChange={e => setStaffOrgFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                  <option value="all">All Organizations</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>

              {/* Table */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                {loadingStaff ? (
                  <div className="p-6 space-y-3">
                    {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <EmptyState icon={Users} title="No Users Found" description="No staff members match your filters." />
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-black/5 dark:border-white/5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-4 px-6">User</th>
                          <th className="py-4 px-6">Role</th>
                          <th className="py-4 px-6">Restaurant</th>
                          <th className="py-4 px-6">Status</th>
                          <th className="py-4 px-6">Last Login</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/5">
                        {filteredStaff.map((s: any) => (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <Image src={s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'U')}&background=f97316&color=fff&bold=true&size=80`} alt="" width={36} height={36} className="w-9 h-9 rounded-xl object-cover" unoptimized />
                                <div>
                                  <p className="font-bold text-slate-900 dark:text-white text-sm">{s.name}</p>
                                  <p className="text-[11px] text-slate-500">{s.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase">
                                {s.role?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-xs font-semibold text-slate-500">{s.branch || 'N/A'}</td>
                            <td className="py-4 px-6"><StatusBadge status={s.status || 'active'} /></td>
                            <td className="py-4 px-6 text-xs text-slate-500">{formatTimeAgo(s.last_login_at)}</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setSelectedStaff(selectedStaff?.id === s.id ? null : s)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all" title="View">
                                  <Eye className="w-4 h-4 text-slate-400" />
                                </button>
                                {s.status !== 'banned' ? (
                                  <button
                                    onClick={() => setConfirmModal({
                                      title: 'Suspend User',
                                      message: `Suspend ${s.name}? They will be unable to log in.`,
                                      action: () => handleStaffStatus(s.id, 'paused'),
                                    })}
                                    disabled={staffActionLoading === s.id}
                                    className="p-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all disabled:opacity-50"
                                    title="Suspend"
                                  >
                                    <Ban className="w-4 h-4 text-amber-500" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleStaffStatus(s.id, 'active')}
                                    disabled={staffActionLoading === s.id}
                                    className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                                    title="Reactivate"
                                  >
                                    <UserCheck className="w-4 h-4 text-emerald-500" />
                                  </button>
                                )}
                                <button onClick={() => { setShowResetPin(s.id); setNewPin(''); }} className="p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all" title="Reset PIN">
                                  <KeyRound className="w-4 h-4 text-blue-500" />
                                </button>
                                <button onClick={() => setShowResetPassword(s.id)} className="p-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all" title="Reset Password">
                                  <Lock className="w-4 h-4 text-purple-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Reset PIN Modal */}
              <AnimatePresence>
                {showResetPin && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-sm w-full border border-black/10 dark:border-white/10 shadow-2xl">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Reset Staff PIN</h3>
                      <input
                        type="password"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value)}
                        placeholder="Enter new 4-8 digit PIN"
                        maxLength={8}
                        className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white text-center tracking-widest mb-4"
                      />
                      <div className="flex gap-3">
                        <button onClick={() => setShowResetPin(null)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
                        <button
                          onClick={() => handleResetPin(showResetPin)}
                          disabled={staffActionLoading === showResetPin || newPin.length < 4}
                          className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 text-sm"
                        >
                          {staffActionLoading === showResetPin ? <LoadingSpinner size="sm" /> : 'Save PIN'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Reset Password Confirmation */}
              <AnimatePresence>
                {showResetPassword && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-sm w-full border border-black/10 dark:border-white/10 shadow-2xl">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reset Password</h3>
                      <p className="text-sm text-slate-500 mb-6">A new temporary password will be generated. The staff member will need to use it on next login.</p>
                      <div className="flex gap-3">
                        <button onClick={() => setShowResetPassword(null)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
                        <button
                          onClick={() => handleResetPassword(showResetPassword)}
                          disabled={staffActionLoading === showResetPassword}
                          className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 text-sm"
                        >
                          {staffActionLoading === showResetPassword ? <LoadingSpinner size="sm" /> : 'Reset Password'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Add User Modal */}
              <AnimatePresence>
                {showAddUser && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-lg w-full border border-black/10 dark:border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Add User</h3>
                        <button onClick={() => { setShowAddUser(false); setAddUserForm({ name: '', email: '', password: '', role: 'cashier', organizationId: '', branchId: '' }); }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-5 h-5 text-slate-400" /></button>
                      </div>
                      <form onSubmit={handleAddUser} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Full Name *</label>
                          <input type="text" required value={addUserForm.name} onChange={e => setAddUserForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Doe" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Email *</label>
                          <input type="email" required value={addUserForm.email} onChange={e => setAddUserForm(p => ({ ...p, email: e.target.value }))} placeholder="user@restaurant.com" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Password *</label>
                          <input type="password" required value={addUserForm.password} onChange={e => setAddUserForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 characters" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Role *</label>
                          <select value={addUserForm.role} onChange={e => setAddUserForm(p => ({ ...p, role: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                            <option value="cashier">Cashier</option>
                            <option value="branch_manager">Branch Manager</option>
                            <option value="restaurant_admin">Restaurant Admin</option>
                            <option value="senior_waiter">Senior Waiter</option>
                            <option value="head_chef">Head Chef</option>
                            <option value="kitchen_staff">Kitchen Staff</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Restaurant *</label>
                          <select required value={addUserForm.organizationId} onChange={e => setAddUserForm(p => ({ ...p, organizationId: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                            <option value="">Select restaurant...</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                        {addUserBranches.length > 0 && (
                          <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Branch</label>
                            <select value={addUserForm.branchId} onChange={e => setAddUserForm(p => ({ ...p, branchId: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                              <option value="">No specific branch</option>
                              {addUserBranches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex gap-3 pt-4">
                          <button type="button" onClick={() => { setShowAddUser(false); setAddUserForm({ name: '', email: '', password: '', role: 'cashier', organizationId: '', branchId: '' }); }} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                          <button type="submit" disabled={addUserLoading} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                            {addUserLoading ? <><LoadingSpinner size="sm" /> Creating...</> : 'Create User'}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          {activeTab === 'devices' && (
            <motion.div key="devices" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Devices</h2>
                  <p className="text-slate-500 font-medium text-xs">Register, monitor, and manage all connected POS devices.</p>
                </div>
                <button
                  onClick={() => {
                    if (orgs.length > 0 && !setupDeviceForm.organizationId) {
                      setSetupDeviceForm(prev => ({ ...prev, organizationId: orgs[0].id }));
                    }
                    setShowSetupDevice(true);
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Setup Device
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} placeholder="Search devices..." className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all" />
                </div>
                <select value={deviceStatusFilter} onChange={e => setDeviceStatusFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="revoked">Revoked</option>
                  <option value="pending">Pending</option>
                </select>
                <select value={deviceTypeFilter} onChange={e => setDeviceTypeFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer">
                  <option value="all">All Types</option>
                  <option value="pos_terminal">POS Terminal</option>
                  <option value="tablet">Tablet</option>
                  <option value="mobile">Mobile</option>
                  <option value="desktop">Desktop</option>
                  <option value="kitchen_display">Kitchen Display</option>
                </select>
              </div>

              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                {loadingDevices ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <EmptyState icon={Smartphone} title="No Devices Found" description="No registered devices match your filters." />
                ) : (
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-black/5 dark:border-white/5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-4 px-6">Device</th>
                          <th className="py-4 px-6">Type</th>
                          <th className="py-4 px-6">Restaurant</th>
                          <th className="py-4 px-6">Status</th>
                          <th className="py-4 px-6">Last Seen</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/5">
                        {filteredDevices.map((d: any) => (
                          <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                                  {d.device_type === 'pos_terminal' ? <Monitor className="w-5 h-5 text-orange-500" /> :
                                   d.device_type === 'tablet' ? <Tablet className="w-5 h-5 text-blue-500" /> :
                                   d.device_type === 'mobile' ? <Phone className="w-5 h-5 text-emerald-500" /> :
                                   <Smartphone className="w-5 h-5 text-purple-500" />}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 dark:text-white text-sm">{d.device_name}</p>
                                  <p className="text-[11px] text-slate-500 font-mono">{d.device_fingerprint?.substring(0, 16)}...</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-xs font-semibold text-slate-500 capitalize">{d.device_type?.replace(/_/g, ' ')}</td>
                            <td className="py-4 px-6 text-xs font-semibold text-slate-500">{d.branch_name || d.organization_id || 'N/A'}</td>
                            <td className="py-4 px-6"><StatusBadge status={d.status || 'pending'} /></td>
                            <td className="py-4 px-6 text-xs text-slate-500">{formatTimeAgo(d.last_seen_at || d.updated_at)}</td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-1 justify-end">
                                {d.status !== 'active' && (
                                  <button
                                    onClick={() => handleDeviceAction(d.id, 'activate')}
                                    disabled={deviceActionLoading === d.id}
                                    className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                                    title="Activate"
                                  >
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                  </button>
                                )}
                                {d.status === 'active' && (
                                  <button
                                    onClick={() => setConfirmModal({
                                      title: 'Suspend Device',
                                      message: `Suspend "${d.device_name}"? It will be unable to connect.`,
                                      action: () => handleDeviceAction(d.id, 'suspend'),
                                    })}
                                    disabled={deviceActionLoading === d.id}
                                    className="p-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all disabled:opacity-50"
                                    title="Suspend"
                                  >
                                    <Ban className="w-4 h-4 text-amber-500" />
                                  </button>
                                )}
                                {d.status !== 'revoked' && (
                                  <button
                                    onClick={() => setConfirmModal({
                                      title: 'Revoke Device',
                                      message: `Permanently revoke "${d.device_name}"? This cannot be undone.`,
                                      action: () => handleDeviceAction(d.id, 'revoke'),
                                    })}
                                    disabled={deviceActionLoading === d.id}
                                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:opacity-50"
                                    title="Revoke"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Setup Device Modal */}
              <AnimatePresence>
                {showSetupDevice && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Setup Device</h3>
                            <p className="text-xs text-slate-500">Generate an enrollment token</p>
                          </div>
                        </div>
                        <button onClick={() => { setShowSetupDevice(false); setGeneratedEnrollmentToken(null); }} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {generatedEnrollmentToken ? (
                        <div className="space-y-4">
                          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Device Enrollment Token</p>
                            <p className="font-mono text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tracking-wider select-all break-all">{generatedEnrollmentToken}</p>
                          </div>
                          <p className="text-xs text-slate-500 text-center">Give this token to the device user. This token expires in 24 hours.</p>
                          <button
                            onClick={() => {
                              setShowSetupDevice(false);
                              setGeneratedEnrollmentToken(null);
                            }}
                            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl shadow-lg hover:opacity-90 transition-all text-sm"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <form onSubmit={handleSetupDevice} className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Target Organization</label>
                            <select
                              value={setupDeviceForm.organizationId}
                              onChange={e => setSetupDeviceForm({ ...setupDeviceForm, organizationId: e.target.value })}
                              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                              required
                            >
                              <option value="">Select Organization</option>
                              {orgs.map((org: any) => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Device Name</label>
                            <input
                              type="text"
                              value={setupDeviceForm.deviceName}
                              onChange={e => setSetupDeviceForm({ ...setupDeviceForm, deviceName: e.target.value })}
                              placeholder="e.g. Front Counter POS 1"
                              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Device Type</label>
                            <select
                              value={setupDeviceForm.deviceType}
                              onChange={e => setSetupDeviceForm({ ...setupDeviceForm, deviceType: e.target.value })}
                              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                            >
                              <option value="pos">POS Terminal</option>
                              <option value="tablet">Tablet</option>
                              <option value="mobile">Mobile</option>
                              <option value="kitchen_display">Kitchen Display</option>
                            </select>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => { setShowSetupDevice(false); setGeneratedEnrollmentToken(null); }}
                              className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={setupDeviceLoading}
                              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-500/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                            >
                              {setupDeviceLoading ? <LoadingSpinner size="sm" /> : 'Generate Token'}
                            </button>
                          </div>
                        </form>
                      )}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ======================== SECURITY TAB ======================== */}
          {activeTab === 'security' && (
            <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Security</h2>
                <p className="text-slate-500 font-medium text-xs">Monitor security alerts, login activity, and audit logs.</p>
              </div>

              {/* Alerts Section */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security Alerts</h3>
                  <div className="flex gap-2">
                    <select value={alertSeverityFilter} onChange={e => setAlertSeverityFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer">
                      <option value="all">All Severity</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="info">Info</option>
                    </select>
                    <select value={alertStatusFilter} onChange={e => setAlertStatusFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer">
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                  {loadingAlerts ? (
                    <div className="p-6 space-y-3">
                      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                  ) : filteredAlerts.length === 0 ? (
                    <EmptyState icon={ShieldCheck} title="No Alerts" description="No security alerts match your filters. The platform is secure." />
                  ) : (
                    <div className="divide-y divide-black/5 dark:divide-white/5">
                      {filteredAlerts.map((alert: any) => (
                        <div key={alert.id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="shrink-0">
                                {alert.severity === 'critical' ? <ShieldAlert className="w-5 h-5 text-red-500" /> :
                                 alert.severity === 'high' ? <AlertTriangle className="w-5 h-5 text-orange-500" /> :
                                 alert.severity === 'medium' ? <AlertCircle className="w-5 h-5 text-yellow-500" /> :
                                 <Info className="w-5 h-5 text-blue-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{alert.title}</p>
                                  <SeverityBadge severity={alert.severity} />
                                </div>
                                {alert.description && <p className="text-xs text-slate-500 truncate">{alert.description}</p>}
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="text-[10px] text-slate-400">{alert.alert_type?.replace(/_/g, ' ')}</span>
                                  {alert.source_ip && <span className="text-[10px] text-slate-400 font-mono">IP: {alert.source_ip}</span>}
                                  <span className="text-[10px] text-slate-400">{formatTimeAgo(alert.created_at)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={alert.status || 'open'} />
                              {alert.status === 'open' && (
                                <>
                                  <button
                                    onClick={() => handleAlertAction(alert.id, 'resolved')}
                                    disabled={alertActionLoading === alert.id}
                                    className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                                    title="Resolve"
                                  >
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                  </button>
                                  <button
                                    onClick={() => handleAlertAction(alert.id, 'dismissed')}
                                    disabled={alertActionLoading === alert.id}
                                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                                    title="Dismiss"
                                  >
                                    <XCircle className="w-4 h-4 text-slate-400" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Log */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Audit Log</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search audit logs..." className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 w-64" />
                  </div>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                  {loadingAudit ? (
                    <div className="p-6 space-y-3">
                      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : filteredAuditLogs.length === 0 ? (
                    <EmptyState icon={Activity} title="No Audit Logs" description="No audit events match your search." />
                  ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-black/5 dark:border-white/5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                            <th className="py-3 px-6">Action</th>
                            <th className="py-3 px-6">Actor</th>
                            <th className="py-3 px-6">Role</th>
                            <th className="py-3 px-6">Result</th>
                            <th className="py-3 px-6">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                          {filteredAuditLogs.slice(0, 50).map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                              <td className="py-3 px-6">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{log.action}</span>
                                {log.details && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</p>}
                              </td>
                              <td className="py-3 px-6 text-xs font-medium text-slate-500">{log.actor_email || log.staff_id || 'System'}</td>
                              <td className="py-3 px-6 text-xs font-medium text-slate-500 capitalize">{log.actor_role?.replace(/_/g, ' ') || '-'}</td>
                              <td className="py-3 px-6">
                                {log.result === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> :
                                 log.result === 'failure' ? <XCircle className="w-4 h-4 text-red-500" /> :
                                 <CircleDot className="w-4 h-4 text-slate-400" />}
                              </td>
                              <td className="py-3 px-6 text-[11px] text-slate-400">{formatTimeAgo(log.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ======================== SUPPORT TAB ======================== */}
          {activeTab === 'support' && (
            <motion.div key="support" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Support</h2>
                  <p className="text-slate-500 font-medium text-xs">Manage support conversations and AI assistance.</p>
                </div>
                <button
                  onClick={() => setShowAiChat(!showAiChat)}
                  className={`px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95 text-xs shrink-0 ${showAiChat ? 'bg-purple-600 text-white shadow-purple-500/20' : 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-purple-500/20'}`}
                >
                  <Sparkles className="w-4 h-4" /> AI Chatbot
                </button>
              </div>

              {/* AI Chat Panel */}
              <AnimatePresence>
                {showAiChat && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20 shadow-2xl rounded-[2rem] p-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Support Assistant</h3>
                          <p className="text-xs text-slate-500">Ask questions about the platform, troubleshooting, or analytics.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={aiQuery}
                          onChange={e => setAiQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAiQuery()}
                          placeholder="Ask a question..."
                          className="flex-1 bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                        <button
                          onClick={handleAiQuery}
                          disabled={aiLoading || !aiQuery.trim()}
                          className="bg-purple-500 hover:bg-purple-600 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50 transition-all"
                        >
                          {aiLoading ? <LoadingSpinner size="sm" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                      {aiResponse && (
                        <div className="mt-4 p-4 bg-white dark:bg-[#121214] rounded-2xl border border-black/5 dark:border-white/10">
                          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{aiResponse}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={convSearch} onChange={e => setConvSearch(e.target.value)} placeholder="Search conversations..." className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all" />
                </div>
                <select value={convStatusFilter} onChange={e => setConvStatusFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none cursor-pointer">
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting">Waiting</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <select value={convPriorityFilter} onChange={e => setConvPriorityFilter(e.target.value)} className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none cursor-pointer">
                  <option value="all">All Priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Conversation List + Detail Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* List */}
                <div className={`${selectedConv ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
                  <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                    {loadingConversations ? (
                      <div className="p-6 space-y-3">
                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                      </div>
                    ) : filteredConversations.length === 0 ? (
                      <EmptyState icon={MessageSquare} title="No Conversations" description="No support tickets match your filters." />
                    ) : (
                      <div className="divide-y divide-black/5 dark:divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
                        {filteredConversations.map((conv: any) => (
                          <button
                            key={conv.id}
                            onClick={() => { setSelectedConv(conv); loadConvMessages(conv.id); }}
                            className={`w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${selectedConv?.id === conv.id ? 'bg-orange-500/5 border-l-2 border-orange-500' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-bold text-slate-900 dark:text-white text-sm truncate flex-1">{conv.subject || 'Untitled'}</p>
                              <StatusBadge status={conv.status || 'open'} />
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              {conv.priority && <SeverityBadge severity={conv.priority} />}
                              {conv.category && <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">{conv.category}</span>}
                              <span>{formatTimeAgo(conv.created_at)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail */}
                {selectedConv && (
                  <div className="lg:col-span-3">
                    <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedConv.subject}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={selectedConv.status} />
                            {selectedConv.priority && <SeverityBadge severity={selectedConv.priority} />}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {selectedConv.status !== 'resolved' && (
                            <button onClick={() => handleConvStatus(selectedConv.id, 'resolved')} disabled={convActionLoading === selectedConv.id} className="px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all">
                              Resolve
                            </button>
                          )}
                          {selectedConv.status !== 'closed' && (
                            <button onClick={() => handleConvStatus(selectedConv.id, 'closed')} disabled={convActionLoading === selectedConv.id} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 text-xs font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                              Close
                            </button>
                          )}
                          <button onClick={() => setSelectedConv(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5">
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar mb-4">
                        {convMessages.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-8">No messages yet.</p>
                        ) : (
                          convMessages.map((msg: any) => (
                            <div key={msg.id} className={`flex ${msg.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.sender_type === 'agent' ? 'bg-orange-500 text-white rounded-br-md' : 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white rounded-bl-md'}`}>
                                <p>{msg.content}</p>
                                <p className={`text-[10px] mt-1 ${msg.sender_type === 'agent' ? 'text-white/70' : 'text-slate-400'}`}>{formatTimeAgo(msg.created_at)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Reply */}
                      {selectedConv.status !== 'closed' && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={convMessageInput}
                            onChange={e => setConvMessageInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendConvMessage(selectedConv.id)}
                            placeholder="Type a reply..."
                            className="flex-1 bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                          />
                          <button onClick={() => handleSendConvMessage(selectedConv.id)} disabled={!convMessageInput.trim()} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold disabled:opacity-50 transition-all">
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ======================== NOTIFICATIONS TAB ======================== */}
          {activeTab === 'notifications' && (
            <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Notifications</h2>
                  <p className="text-slate-500 font-medium text-xs">Notification center — all platform alerts and messages.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setNotifFilter(notifFilter === 'unread' ? 'all' : 'unread')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${notifFilter === 'unread' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                  >
                    {notifFilter === 'unread' ? 'Show All' : 'Unread Only'}
                  </button>
                  <button
                    onClick={handleMarkAllRead}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold transition-all flex items-center gap-2"
                  >
                    <CheckCheck className="w-4 h-4" /> Mark All Read
                  </button>
                </div>
              </div>

              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                {loadingNotifications ? (
                  <div className="p-6 space-y-3">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <EmptyState icon={Bell} title="No Notifications" description={notifFilter === 'unread' ? "You're all caught up!" : "No notifications yet."} />
                ) : (
                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {filteredNotifications.map((notif: any) => (
                      <div key={notif.id} className={`p-4 sm:px-6 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-start gap-4 ${!notif.is_read ? 'bg-orange-500/5' : ''}`}>
                        <div className="shrink-0 mt-0.5">
                          {!notif.is_read ? (
                            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-transparent" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm ${!notif.is_read ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>{notif.title}</p>
                            {notif.priority && <SeverityBadge severity={notif.priority} />}
                          </div>
                          {notif.message && <p className="text-xs text-slate-500 truncate">{notif.message}</p>}
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] text-slate-400">{notif.type?.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-slate-400">{formatTimeAgo(notif.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ======================== ANALYTICS TAB ======================== */}
          {activeTab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Platform Analytics</h2>
                  <p className="text-slate-500 font-medium text-xs">Revenue, orders, and growth metrics across all restaurants.</p>
                </div>
                <div className="flex items-center gap-2">
                  {(['7', '30', '90'] as const).map(days => (
                    <button
                      key={days}
                      onClick={() => setAnalyticsTimeframe(days)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${analyticsTimeframe === days ? 'bg-orange-500 text-white shadow-md' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                    >
                      {days} Days
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setLoadingAnalytics(true);
                      fetch('/api/super-admin/analytics', { headers: authHeaders() })
                        .then(r => r.ok ? r.json() : null)
                        .then(d => { setAnalytics(d?.data || DEFAULT_ANALYTICS); setLoadingAnalytics(false); showToast('Analytics refreshed!'); })
                        .catch(() => { setAnalytics(DEFAULT_ANALYTICS); setLoadingAnalytics(false); showToast('Failed to refresh analytics', 'error'); });
                    }}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 transition-all ml-2"
                    title="Refresh Analytics"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {loadingAnalytics ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-[2rem] p-6 text-white shadow-lg shadow-orange-500/20">
                      <DollarSign className="w-8 h-8 mb-2 opacity-80" />
                      <p className="text-3xl font-black">{((analytics?.totalRevenue || 0)).toLocaleString()}</p>
                      <p className="text-xs opacity-80">Total Revenue (UGX)</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Activity className="w-8 h-8 mb-2 text-blue-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{analytics?.totalOrders || 0}</p>
                      <p className="text-xs text-slate-500">Total Orders</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Store className="w-8 h-8 mb-2 text-emerald-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{analytics?.activeRestaurants || 0}/{analytics?.totalRestaurants || 0}</p>
                      <p className="text-xs text-slate-500">Active Restaurants</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Users className="w-8 h-8 mb-2 text-purple-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{analytics?.activeStaff || 0}/{analytics?.totalStaff || 0}</p>
                      <p className="text-xs text-slate-500">Active Staff</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Revenue (Last {analyticsTimeframe} Days)</h3>
                      {analytics?.revenueByDay?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={analytics.revenueByDay.map((d: any) => ({ date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: Number(d.revenue) }))}>
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="#f9731620" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : <p className="text-center text-slate-500 py-8">No revenue recorded yet</p>}
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Orders (Last {analyticsTimeframe} Days)</h3>
                      {analytics?.ordersByDay?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={analytics.ordersByDay.map((d: any) => ({ date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), orders: Number(d.count) }))}>
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="orders" fill="#f97316" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-center text-slate-500 py-8">No order activity recorded yet</p>}
                    </div>
                  </div>
                  <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Staff Breakdown by Role</h3>
                    {analytics?.staffByRole?.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {analytics.staffByRole.map((r: any) => (
                          <div key={r.role} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                              <Users className="w-5 h-5 text-orange-500" />
                            </div>
                            <div>
                              <p className="text-lg font-bold text-slate-900 dark:text-white">{Number(r.count)}</p>
                              <p className="text-[10px] text-slate-500 capitalize">{r.role?.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-center text-slate-500 py-4">No staff roles found</p>}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======================== BILLING TAB ======================== */}
          {activeTab === 'billing' && (
            <motion.div key="billing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Billing & Subscriptions</h2>
                <p className="text-slate-500 font-medium text-xs">Manage plans, subscriptions, and revenue.</p>
              </div>
              {loadingBilling || !billing ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-[2rem] p-6 text-white">
                      <DollarSign className="w-8 h-8 mb-2 opacity-80" />
                      <p className="text-3xl font-black">{(billing.summary?.mrr || 0).toLocaleString()} UGX</p>
                      <p className="text-xs opacity-80">Monthly Recurring Revenue</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <CheckCircle className="w-8 h-8 mb-2 text-emerald-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{billing.summary?.activeCount || 0}</p>
                      <p className="text-xs text-slate-500">Active Subscriptions</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <AlertTriangle className="w-8 h-8 mb-2 text-red-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{billing.summary?.pastDueCount || 0}</p>
                      <p className="text-xs text-slate-500">Past Due</p>
                    </div>
                  </div>
                  <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Subscription Plans</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {billing.plans?.map((plan: any) => (
                        <div key={plan.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5">
                          <h4 className="font-bold text-slate-900 dark:text-white">{plan.display_name}</h4>
                          <p className="text-2xl font-black text-orange-500 mt-2">{Number(plan.monthly_price_ugx).toLocaleString()} UGX<span className="text-xs text-slate-500 font-normal">/mo</span></p>
                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            <p>{plan.max_branches} branches</p>
                            <p>{plan.max_staff} staff</p>
                            <p>{plan.max_menu_items} menu items</p>
                            <p>{plan.max_orders_per_day} orders/day</p>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-3">
                            {plan.features?.map((f: string) => (
                              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Active Subscriptions</h3>
                    {billing.subscriptions?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-black/10 dark:border-white/10">
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Restaurant</th>
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Plan</th>
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Started</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billing.subscriptions.map((sub: any) => (
                              <tr key={sub.id} className="border-b border-black/5 dark:border-white/5">
                                <td className="py-3 px-4 text-sm font-bold text-slate-900 dark:text-white">{sub.org_name}</td>
                                <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{sub.plan_display_name || sub.plan_name}</td>
                                <td className="py-3 px-4"><StatusBadge status={sub.status} /></td>
                                <td className="py-3 px-4 text-xs text-slate-500">{formatDate(sub.started_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-slate-500 py-8">No subscriptions found</p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======================== ADMINS TAB ======================== */}
          {activeTab === 'admins' && (
            <motion.div key="admins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Super Admins</h2>
                  <p className="text-slate-500 font-medium text-xs">{admins.length} admin accounts</p>
                </div>
                <button onClick={() => setShowCreateAdmin(true)} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl font-bold text-sm">
                  <Plus className="w-4 h-4" /> Add Admin
                </button>
              </div>
              {loadingAdmins ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : (
                <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-black/10 dark:border-white/10">
                          <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase">Name</th>
                          <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase">Email</th>
                          <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                          <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase">Last Login</th>
                          <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {admins.map((admin: any) => (
                          <tr key={admin.id} className="border-b border-black/5 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                                  {admin.name?.charAt(0)}
                                </div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{admin.name}</p>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">{admin.email}</td>
                            <td className="py-4 px-6"><StatusBadge status={admin.is_active ? 'active' : 'inactive'} /></td>
                            <td className="py-4 px-6 text-xs text-slate-500">{formatDateTime(admin.last_login_at)}</td>
                            <td className="py-4 px-6">
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    setAdminActionLoading(admin.id);
                                    try {
                                      const res = await fetch(`/api/super-admin/admins/${admin.id}`, {
                                        method: 'PUT', headers: authHeaders(),
                                        body: JSON.stringify({ is_active: !admin.is_active }),
                                      });
                                      if (res.ok) {
                                        setAdmins((prev: any[]) => prev.map((a: any) => a.id === admin.id ? { ...a, is_active: !a.is_active } : a));
                                        showToast(`Admin ${admin.is_active ? 'deactivated' : 'activated'}`);
                                      } else {
                                        const d = await res.json().catch(() => ({}));
                                        showToast(d.error || 'Failed to update admin', 'error');
                                      }
                                    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
                                    setAdminActionLoading(null);
                                  }}
                                  disabled={adminActionLoading === admin.id}
                                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"
                                >
                                  {admin.is_active ? <Ban className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {admins.length === 0 && <p className="text-center text-slate-500 py-8">No admins found</p>}
                </div>
              )}
            </motion.div>
          )}

          {/* ======================== SYSTEM HEALTH TAB ======================== */}
          {activeTab === 'system-health' && (
            <motion.div key="system-health" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">System Health</h2>
                  <p className="text-slate-500 font-medium text-xs">Database, server, and infrastructure status.</p>
                </div>
                <button onClick={() => { setLoadingSystemHealth(true); fetch('/api/super-admin/system-health', { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(d => { if (d?.data) setSystemHealth(d.data); setLoadingSystemHealth(false); }).catch(() => setLoadingSystemHealth(false)); }} className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              {loadingSystemHealth || !systemHealth ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`rounded-[2rem] p-6 ${systemHealth.database?.status === 'ok' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white' : 'bg-gradient-to-br from-red-500 to-red-600 text-white'}`}>
                      <Database className="w-8 h-8 mb-2 opacity-80" />
                      <p className="text-3xl font-black">{systemHealth.database?.status === 'ok' ? 'OK' : 'Error'}</p>
                      <p className="text-xs opacity-80">Database</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Activity className="w-8 h-8 mb-2 text-blue-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.database?.latencyMs || 0}ms</p>
                      <p className="text-xs text-slate-500">DB Latency</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <HardDrive className="w-8 h-8 mb-2 text-purple-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.database?.sizeFormatted || 'N/A'}</p>
                      <p className="text-xs text-slate-500">DB Size</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Network className="w-8 h-8 mb-2 text-orange-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.database?.activeConnections || 0}</p>
                      <p className="text-xs text-slate-500">Active Connections</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Server className="w-8 h-8 mb-2 text-slate-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.server?.nodeVersion || 'N/A'}</p>
                      <p className="text-xs text-slate-500">Node.js</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Clock className="w-8 h-8 mb-2 text-emerald-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.server?.uptime ? `${Math.floor(systemHealth.server.uptime / 3600)}h ${Math.floor((systemHealth.server.uptime % 3600) / 60)}m` : 'N/A'}</p>
                      <p className="text-xs text-slate-500">Uptime</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Cpu className="w-8 h-8 mb-2 text-blue-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.server?.memory ? `${(systemHealth.server.memory.rss / 1024 / 1024).toFixed(0)}MB` : 'N/A'}</p>
                      <p className="text-xs text-slate-500">Memory (RSS)</p>
                    </div>
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <Gauge className="w-8 h-8 mb-2 text-amber-500" />
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{systemHealth.recentErrors?.length || 0}</p>
                      <p className="text-xs text-slate-500">Errors (24h)</p>
                    </div>
                  </div>
                  {systemHealth.tables?.length > 0 && (
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Table Sizes</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-black/10 dark:border-white/10">
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Table</th>
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Rows</th>
                              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Size</th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemHealth.tables.slice(0, 15).map((t: any) => (
                              <tr key={t.table_name} className="border-b border-black/5 dark:border-white/5">
                                <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white">{t.table_name}</td>
                                <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{Number(t.row_count).toLocaleString()}</td>
                                <td className="py-3 px-4 text-sm text-slate-500">{t.total_size}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {systemHealth.recentErrors?.length > 0 && (
                    <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Errors (24h)</h3>
                      <div className="space-y-2">
                        {systemHealth.recentErrors.slice(0, 10).map((e: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{e.action}</p>
                              <p className="text-xs text-slate-500">{e.actor} &middot; {formatDateTime(e.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ======================== PLATFORM SETTINGS TAB ======================== */}
          {activeTab === 'platform-settings' && (
            <motion.div key="platform-settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Platform Settings</h2>
                  <p className="text-slate-500 font-medium text-xs">Global platform configuration.</p>
                </div>
                <button
                  onClick={async () => {
                    setSettingsSaving(true);
                    try {
                      const res = await fetch('/api/super-admin/platform-settings', {
                        method: 'PUT', headers: authHeaders(),
                        body: JSON.stringify({ settings: platformSettings.map((s: any) => ({ key: s.key, value: s.value })) }),
                      });
                      if (res.ok) {
                        const d = await res.json();
                        if (d.data) setPlatformSettings(d.data);
                        showToast('Platform settings saved successfully');
                      } else {
                        const d = await res.json().catch(() => ({}));
                        showToast(d.error || 'Failed to save settings', 'error');
                      }
                    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
                    setSettingsSaving(false);
                  }}
                  disabled={settingsSaving}
                  className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  {settingsSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
              {loadingPlatformSettings ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : (
                <div className="bg-white/80 dark:bg-[#121214]/80 border border-white/40 dark:border-white/5 rounded-[2rem] p-8">
                  <div className="space-y-6">
                    {platformSettings.map((setting: any) => (
                      <div key={setting.key} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{setting.key.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500">Current value: {JSON.stringify(setting.value)}</p>
                        </div>
                        {setting.key === 'maintenance_mode' ? (
                          <button
                            onClick={() => {
                              setPlatformSettings((prev: any[]) => prev.map((s: any) => s.key === 'maintenance_mode' ? { ...s, value: { enabled: !s.value?.enabled } } : s));
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${setting.value?.enabled ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${setting.value?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        ) : setting.key === 'max_login_attempts' || setting.key === 'session_timeout_minutes' ? (
                          <input
                            type="number"
                            value={setting.value?.max || setting.value?.minutes || 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setPlatformSettings((prev: any[]) => prev.map((s: any) => s.key === setting.key ? { ...s, value: { [setting.key === 'max_login_attempts' ? 'max' : 'minutes']: val } } : s));
                            }}
                            className="w-24 px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-right"
                          />
                        ) : (
                          <input
                            type="text"
                            value={setting.value?.value || setting.value?.language || ''}
                            onChange={(e) => {
                              const key = setting.value?.language !== undefined ? 'language' : 'value';
                              setPlatformSettings((prev: any[]) => prev.map((s: any) => s.key === setting.key ? { ...s, value: { ...s.value, [key]: e.target.value } } : s));
                            }}
                            className="w-64 px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ======================== SETTINGS TAB ======================== */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h2>
                <p className="text-slate-500 font-medium text-xs">Feature flags, system health, and platform configuration.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Feature Flags */}
                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                      <Flag className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Feature Flags</h3>
                      <p className="text-xs text-slate-500">Toggle platform features on/off</p>
                    </div>
                  </div>

                  {loadingFlags ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : featureFlags.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No feature flags configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {featureFlags.map((flag: any) => (
                        <div key={flag.key} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{flag.key}</p>
                            {flag.description && <p className="text-[11px] text-slate-500">{flag.description}</p>}
                            <span className="text-[10px] text-slate-400">Scope: {flag.scope}</span>
                          </div>
                          <button
                            onClick={() => handleToggleFlag(flag.key)}
                            disabled={flagToggling === flag.key}
                            className={`w-12 h-7 rounded-full transition-all relative ${flag.enabled ? 'bg-orange-500' : 'bg-slate-200 dark:bg-white/10'}`}
                          >
                            {flagToggling === flag.key ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${flag.enabled ? 'left-6' : 'left-1'}`} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* System Health */}
                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Stethoscope className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">System Health</h3>
                      <p className="text-xs text-slate-500">Infrastructure and service status</p>
                    </div>
                  </div>

                  {loadingHealth || !health ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`flex items-center justify-between p-4 rounded-2xl border ${health.status === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                        <div className="flex items-center gap-3">
                          <HeartPulse className={`w-5 h-5 ${health.status === 'healthy' ? 'text-emerald-500' : 'text-red-500'}`} />
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Platform Status</p>
                            <p className="text-xs text-slate-500">Last checked: {formatDateTime(health.timestamp)}</p>
                          </div>
                        </div>
                        <StatusBadge status={health.status === 'healthy' ? 'active' : 'suspended'} />
                      </div>

                      {Object.entries(health.checks || {}).map(([key, check]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                          <div className="flex items-center gap-3">
                            {key === 'database' ? <Database className="w-4 h-4 text-slate-400" /> :
                             <Server className="w-4 h-4 text-slate-400" />}
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize">{key}</p>
                              {check.latencyMs !== undefined && <p className="text-[10px] text-slate-400">Latency: {check.latencyMs}ms</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {check.status === 'ok' ? (
                              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
                            ) : (
                              <span className="text-xs font-bold text-red-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Error</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Platform Config Summary */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <Gauge className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Platform Summary</h3>
                    <p className="text-xs text-slate-500">Key platform metrics at a glance</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                    <Store className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalOrgs}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Organizations</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                    <Users className="w-5 h-5 text-blue-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalStaffCount}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Staff Members</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                    <Smartphone className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalDevices}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Registered Devices</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                    <Flag className="w-5 h-5 text-purple-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{featureFlags.length}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Active Features</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ==================== CREATE RESTAURANT MODAL ==================== */}
      <AnimatePresence>
        {showCreateOrg && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-lg w-full border border-black/10 dark:border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Create Restaurant</h3>
                <button onClick={() => setShowCreateOrg(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Restaurant Name *</label>
                  <input type="text" required value={createOrgForm.name} onChange={e => setCreateOrgForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. My Restaurant" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Contact Email</label>
                    <input type="email" value={createOrgForm.contactEmail} onChange={e => setCreateOrgForm(p => ({ ...p, contactEmail: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Phone</label>
                    <input type="tel" value={createOrgForm.contactPhone} onChange={e => setCreateOrgForm(p => ({ ...p, contactPhone: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Tax ID</label>
                    <input type="text" value={createOrgForm.taxId} onChange={e => setCreateOrgForm(p => ({ ...p, taxId: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Address</label>
                    <input type="text" value={createOrgForm.address} onChange={e => setCreateOrgForm(p => ({ ...p, address: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 mt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Initial Branch (Optional)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Branch Name</label>
                      <input type="text" value={createOrgForm.branchName} onChange={e => setCreateOrgForm(p => ({ ...p, branchName: e.target.value }))} placeholder="e.g. Main Branch" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Branch Location</label>
                      <input type="text" value={createOrgForm.branchLocation} onChange={e => setCreateOrgForm(p => ({ ...p, branchLocation: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 mt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Restaurant Admin (Required)</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Admin Name *</label>
                        <input type="text" required value={createOrgForm.adminName} onChange={e => setCreateOrgForm(p => ({ ...p, adminName: e.target.value }))} placeholder="e.g. John Admin" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Admin Email *</label>
                        <input type="email" required value={createOrgForm.adminEmail} onChange={e => setCreateOrgForm(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@restaurant.com" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Admin Password *</label>
                      <input type="password" required value={createOrgForm.adminPassword} onChange={e => setCreateOrgForm(p => ({ ...p, adminPassword: e.target.value }))} placeholder="Min 8 characters" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 mt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Branch Manager (Optional)</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Manager Name</label>
                        <input type="text" value={createOrgForm.managerName} onChange={e => setCreateOrgForm(p => ({ ...p, managerName: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Manager Email</label>
                        <input type="email" value={createOrgForm.managerEmail} onChange={e => setCreateOrgForm(p => ({ ...p, managerEmail: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Manager Phone</label>
                      <input type="tel" value={createOrgForm.managerPhone} onChange={e => setCreateOrgForm(p => ({ ...p, managerPhone: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowCreateOrg(false)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                  <button type="submit" disabled={orgActionLoading === 'create'} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    {orgActionLoading === 'create' ? <><LoadingSpinner size="sm" /> Creating...</> : 'Create Restaurant'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== CREATE ADMIN MODAL ==================== */}
      <AnimatePresence>
        {showCreateAdmin && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                    <UserCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add Super Admin</h3>
                    <p className="text-xs text-slate-500">Create new platform administrator</p>
                  </div>
                </div>
                <button onClick={() => setShowCreateAdmin(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Full Name *</label>
                  <input type="text" required value={createAdminForm.name} onChange={e => setCreateAdminForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Sarah Connor" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Email Address *</label>
                  <input type="email" required value={createAdminForm.email} onChange={e => setCreateAdminForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@restaurant.com" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Password *</label>
                  <input type="password" required minLength={8} value={createAdminForm.password} onChange={e => setCreateAdminForm(p => ({ ...p, password: e.target.value }))} placeholder="At least 8 characters" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
                </div>
                {createAdminError && <p className="text-xs text-red-500 font-medium">{createAdminError}</p>}
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowCreateAdmin(false)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
                  <button type="submit" disabled={adminActionLoading === 'create'} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2 transition-all">
                    {adminActionLoading === 'create' ? <><LoadingSpinner size="sm" /> Creating...</> : 'Create Admin'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== CONFIRM MODAL ==================== */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-sm w-full border border-black/10 dark:border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{confirmModal.title}</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
                <button
                  onClick={confirmModal.action}
                  disabled={confirmModal.loading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-red-500/20 disabled:opacity-50 text-sm"
                >
                  {confirmModal.loading ? <LoadingSpinner size="sm" /> : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== TOAST FEEDBACK ==================== */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 right-6 z-50">
            <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-bold ${toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-red-500 text-white border-red-400'}`}>
              {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span>{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
