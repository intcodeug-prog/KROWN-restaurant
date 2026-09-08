'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users as UsersIcon, Plus, Mail, Building2, Phone, CreditCard,
  ShieldAlert, Trash2, Ban, PauseCircle, PlayCircle, Image as ImageIcon,
  RefreshCw, CheckCircle2, AlertCircle, Loader2, Key
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { StaffMember, Branch } from '@/lib/mockData';
import { uploadImageFile } from '@/lib/imageUpload';


// ── Helpers ───────────────────────────────────────────────────────────────────
function mapDbToStaff(row: any): StaffMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'Senior Waiter',
    branch: row.branch || '',
    assignedBranchId: row.assigned_branch_id || null,
    status: row.status || 'active',
    avatar: row.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || 'S')}&background=f97316&color=fff&bold=true&size=200`,
    phone: row.phone,
    idType: row.id_type,
    idNumber: row.id_number,
  };
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ManagerStaff({ currentBranchId }: { currentBranchId?: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [resetEmailStaff, setResetEmailStaff] = useState<StaffMember | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Staff@123');
  const [pin, setPin] = useState('1234');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState<'National ID' | 'Passport' | 'Student ID'>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [role, setRole] = useState<StaffMember['role']>('Senior Waiter');
  const [selectedBranch, setSelectedBranch] = useState(currentBranchId && currentBranchId !== 'all' ? currentBranchId : '');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationResult, setCreationResult] = useState<{ success: boolean; msg: string } | null>(null);

  // ── Load staff from Neon API ──────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    setIsLoading(true);
    try {
      const branchParam = (currentBranchId && currentBranchId !== 'all') ? `?branchId=${currentBranchId}` : '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/staff${branchParam}`, { headers });
      const json = await res.json();
      const mapped = (json.data || []).map(mapDbToStaff);
      const filteredStaff: StaffMember[] = mapped.filter((s: StaffMember) => !['super_admin', 'restaurant_admin', 'Super Admin', 'Restaurant Admin'].includes(s.role));
      setStaff(filteredStaff);
      dataStore.syncStaffFromDB(mapped);
    } catch (err) {
      console.error('[ManagerStaff] Load error:', err);
      setStaff(dataStore.getStaff(currentBranchId).filter(s => currentBranchId === 'all' || s.role !== 'Super Admin'));
    } finally {
      setIsLoading(false);
    }
  }, [currentBranchId]);

  // ── Load branches ─────────────────────────────────────────────────────────
  const loadBranches = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/branches', { headers });
      const { data } = await res.json();
      if (data && data.length > 0) {
        const mapped: Branch[] = data.map((b: any) => ({
          id: b.id,
          name: b.name,
          location: b.location,
          city: b.city,
          manager: b.manager,
          phone: b.phone,
          email: b.email,
          status: b.status,
          tablesCount: b.tables_count,
          dailyRevenueUGX: b.daily_revenue_ugx,
          ordersToday: b.orders_today,
        }));
        setBranches(mapped);
      } else {
        setBranches(dataStore.getBranches());
      }
    } catch {
      setBranches(dataStore.getBranches());
    }
  }, []);

  // Run Auth sync once on mount
  useEffect(() => {
    (async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/admin/sync-staff', { method: 'POST', headers });
        const json = await res.json();
        if (json.success && Array.isArray(json.staff)) {
          dataStore.syncStaffFromDB(json.staff);
          loadStaff();
        }
      } catch (e) {
        console.warn('[ManagerStaff] Initial Auth sync notice:', e);
      }
    })();
  }, [loadStaff]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStaff();
    loadBranches();
    return () => {};
  }, [loadStaff, loadBranches]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Image upload ──────────────────────────────────────────────────────────
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const res = await uploadImageFile(file);
    setIsUploading(false);
    if (res.previewUrl) setPreviewUrl(res.previewUrl);
    if (res.url) setAvatarUrl(res.url);
  };

  // ── Create Staff ──────────────────────────────────────────────────────────
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setCreationResult(null);

    const targetBranch = branches.find(b => b.id === selectedBranch)?.name || 'FAZE 3';
    const staffEmail = email.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}@krownpos.com`;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/create-staff', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          email: staffEmail,
          password: password || 'Staff@123',
          pin: pin || '1234',
          phone: phone.trim() || null,
          idType,
          idNumber: idNumber.trim() || null,
          role,
          branch: targetBranch,
          assignedBranchId: selectedBranch || null,
          avatar: avatarUrl || previewUrl || null,
        })
      });

      const json = await res.json();

      if (json.success && json.staff) {
        dataStore.addStaff(json.staff);
        setStaff(dataStore.getStaff(currentBranchId));
        setCreationResult({
          success: true,
          msg: `✓ ${json.staff.name} enrolled! They can now log in with their email and password.`
        });
        showToast('success', `${json.staff.name} enrolled as ${json.staff.role}`);
        // Reset form after 2s
        setTimeout(() => {
          setName(''); setEmail(''); setPassword('Staff@123'); setPin('1234');
          setPhone(''); setIdNumber(''); setAvatarUrl(''); setPreviewUrl('');
          setCreationResult(null);
          setShowAddModal(false);
        }, 2000);
      } else {
        const errMsg = json.error || json.warning || 'Failed to create staff member';
        setCreationResult({ success: false, msg: errMsg });
        showToast('error', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error creating staff member';
      setCreationResult({ success: false, msg: errMsg });
      showToast('error', errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Staff Actions ─────────────────────────────────────────────────────────
  const handleAction = async (action: string, staffMember: StaffMember, extra?: any) => {
    try {
      if (action === 'delete') {
        dataStore.deleteStaff(staffMember.id);
        setStaff(prev => prev.filter(s => s.id !== staffMember.id));
      } else if (action === 'update_status' && extra?.status) {
        dataStore.updateStaffStatus(staffMember.id, extra.status);
        setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, status: extra.status } : s));
      } else if (action === 'update_role' && extra?.role) {
        const dbRole = normalizeRole(extra.role) as StaffMember['role'];
        dataStore.updateStaffRole(staffMember.id, dbRole);
        setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, role: dbRole } : s));
        extra = { ...extra, role: dbRole };
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/manage-staff', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, staffId: staffMember.id, ...extra })
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', json.message || 'Action completed successfully');
        await loadStaff();
      } else {
        showToast('error', json.error || 'Action failed');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Network error performing action');
    }
  };

  const handleSendResetEmail = async (staffMember: StaffMember) => {
    setSendingReset(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/admin/send-reset-email', {
        method: 'POST', headers,
        body: JSON.stringify({ staffId: staffMember.id }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', json.message || 'Reset email sent successfully');
        setResetEmailStaff(null);
      } else {
        showToast('error', json.error || 'Failed to send reset email');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Network error sending reset email');
    } finally { setSendingReset(false); }
  };

  // ── Role badge styling ────────────────────────────────────────────────────
  // ── Role normalization ─────────────────────────────────────────────────────
  const normalizeRole = (r: string) => {
    const map: Record<string, string> = {
      super_admin: 'Super Admin', restaurant_admin: 'Restaurant Admin', admin: 'Restaurant Admin',
      branch_manager: 'Branch Manager', manager: 'Branch Manager',
      head_chef: 'Head Chef', chef: 'Head Chef', kitchen_staff: 'Kitchen Staff',
      cashier: 'Cashier', senior_waiter: 'Senior Waiter', waiter: 'Senior Waiter',
    };
    return map[r?.toLowerCase()?.replace(/[\s-]+/g, '_')] || r || 'Staff';
  };
  const roleBadge = (r: string) => {
    const nr = normalizeRole(r);
    if (nr === 'Super Admin') return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    if (nr === 'Restaurant Admin') return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    if (nr === 'Branch Manager') return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    if (nr === 'Head Chef' || nr === 'Kitchen Staff') return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    if (nr === 'Cashier') return 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  };

  // ── Dashboard routes by role (for display) ────────────────────────────────
  const roleDashboard = (r: string) => {
    const nr = normalizeRole(r);
    if (nr === 'Super Admin') return 'Admin Dashboard';
    if (nr === 'Restaurant Admin') return 'Admin Dashboard';
    if (nr === 'Branch Manager') return 'Manager Dashboard';
    if (nr === 'Head Chef' || nr === 'Kitchen Staff') return 'Kitchen Display';
    if (nr === 'Cashier') return 'Cashier Checkout';
    return 'POS Terminal';
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Staff & Personnel
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            {staff.length} staff member{staff.length !== 1 ? 's' : ''} enrolled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadStaff}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            title="Refresh staff from database"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm shrink-0"
          >
            <Plus className="w-4 h-4" /> Enroll New Staff
          </button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl font-semibold text-sm shadow-lg ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Staff Cards */}
      <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10 flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-slate-500 font-medium text-sm">Loading staff...</p>
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              <UsersIcon className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-white">No Staff Enrolled Yet</p>
              <p className="text-slate-500 text-sm mt-1">Click &quot;Enroll New Staff&quot; to add your first team member.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {staff.map(u => (
              <div
                key={u.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-sm ${
                  u.status === 'banned'
                    ? 'bg-red-500/5 border-red-500/20'
                    : u.status === 'paused'
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-slate-50 dark:bg-black/20 border-black/5 dark:border-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=f97316&color=fff&bold=true&size=200`}
                      alt={u.name}
                      className="w-14 h-14 rounded-2xl object-cover ring-2 ring-orange-500/30 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=f97316&color=fff&bold=true&size=200`;
                      }}
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-base">{u.name}</h4>
                      {u.email && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" /> {u.email}
                        </p>
                      )}
                      {u.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" /> {u.phone}
                        </p>
                      )}
                      {u.idNumber && (
                        <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <CreditCard className="w-3 h-3 text-orange-500" /> {u.idType || 'ID'}: {u.idNumber}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 font-semibold">
                        <Building2 className="w-3 h-3 text-slate-400" /> {u.branch || 'Unassigned'}
                        <span className="text-[10px] text-slate-400 font-normal">→ {roleDashboard(u.role)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <select
                      value={normalizeRole(u.role)}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        if (confirm(`Change ${u.name}'s role to "${newRole}"?`)) {
                          handleAction('update_role', u, { role: newRole });
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 ${roleBadge(u.role)}`}
                      title="Click to change staff role"
                    >
                      <option value="Restaurant Admin">Restaurant Admin</option>
                      <option value="Branch Manager">Branch Manager (Manager)</option>
                      <option value="Cashier">Cashier (Checkout)</option>
                      <option value="Senior Waiter">Senior Waiter (POS)</option>
                      <option value="Head Chef">Head Chef (Kitchen)</option>
                      <option value="Kitchen Staff">Kitchen Staff (Kitchen)</option>
                    </select>
                    <span className={`text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                      u.status === 'banned' ? 'bg-red-500/20 text-red-500' :
                      u.status === 'paused' ? 'bg-amber-500/20 text-amber-500' :
                      'bg-green-500/20 text-green-500'
                    }`}>
                      {u.status || 'Active'}
                    </span>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-end gap-2 flex-wrap">
                  {u.status !== 'banned' && u.status !== 'paused' && (
                    <button
                      onClick={() => handleAction('update_status', u, { status: 'paused' })}
                      className="px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <PauseCircle className="w-3.5 h-3.5" /> Pause
                    </button>
                  )}

                  {u.status === 'paused' && (
                    <button
                      onClick={() => handleAction('update_status', u, { status: 'active' })}
                      className="px-3 py-1.5 text-xs font-bold text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> Reactivate
                    </button>
                  )}

                  {u.status !== 'banned' ? (
                    <button
                      onClick={() => handleAction('update_status', u, { status: 'banned' })}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" /> Ban
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction('update_status', u, { status: 'active' })}
                      className="px-3 py-1.5 text-xs font-bold text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> Unban
                    </button>
                  )}


                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-lg w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Enroll Staff Member</h3>
                <p className="text-xs text-slate-500 mt-1">Staff will be created and can log in immediately.</p>
              </div>

              <form onSubmit={handleAddStaff} className="space-y-3">
                {/* Photo */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Staff Photo</label>
                  <div className="flex items-center gap-4 bg-slate-50 dark:bg-black/30 p-3 rounded-2xl border border-black/10 dark:border-white/10">
                    {previewUrl || avatarUrl ? (
                      <Image src={previewUrl || avatarUrl} alt="Preview" width={64} height={64} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-orange-500" unoptimized />
                    ) : (
                      <div className="w-16 h-16 bg-slate-200 dark:bg-white/10 rounded-2xl flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input type="file" accept="image/*" onChange={handleImageFileChange}
                        className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-500 file:text-white hover:file:bg-orange-600 cursor-pointer" />
                      {isUploading && <p className="text-[10px] text-orange-500 font-bold mt-1">Uploading...</p>}
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Full Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Samuel Mukasa"
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Email Address *</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="samuel@example.com"
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Phone Number</label>
                    <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+256 770 123 456"
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">ID Type</label>
                    <select value={idType} onChange={e => setIdType(e.target.value as any)}
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white">
                      <option value="National ID">National ID (NIN)</option>
                      <option value="Passport">Passport</option>
                      <option value="Student ID">Student ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">ID Number</label>
                    <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)}
                      placeholder="CM902810428"
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white font-mono" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">System Role *</label>
                    <select value={role} onChange={e => setRole(e.target.value as any)}
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white">
                      <option value="Senior Waiter">Senior Waiter → POS</option>
                      <option value="Cashier">Cashier → Checkout</option>
                      <option value="Head Chef">Head Chef → Kitchen</option>
                      <option value="Kitchen Staff">Kitchen Staff → Kitchen</option>
                      <option value="Branch Manager">Branch Manager → Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Assigned Branch *</label>
                    <select required value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white">
                      <option value="">Select a branch...</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                      {branches.length === 0 && <option value="" disabled>No branches available</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Login Password *</label>
                    <input type="text" required value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Staff@123 (min 6 chars)"
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">4-Digit PIN</label>
                    <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••" maxLength={4}
                      className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white font-mono" />
                  </div>
                </div>

                {/* Creation result feedback */}
                <AnimatePresence>
                  {creationResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`flex items-start gap-2 p-3 rounded-xl text-xs font-semibold ${
                        creationResult.success
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {creationResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                      {creationResult.msg}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddModal(false); setCreationResult(null); }}
                    className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling...</>
                    ) : 'Enroll Staff Member'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Send Reset Email Confirmation Modal */}
      <AnimatePresence>
        {resetEmailStaff && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2rem] p-6 max-w-sm w-full border border-black/10 dark:border-white/10 shadow-2xl">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mx-auto mb-4">
                <Mail className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 text-center">Send Password Reset</h3>
              <p className="text-sm text-slate-500 mb-6 text-center">
                A password reset link will be sent to <strong className="text-slate-700 dark:text-slate-300">{resetEmailStaff.email}</strong>. They can then set their own new password securely.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setResetEmailStaff(null)}
                  className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleSendResetEmail(resetEmailStaff)}
                  disabled={sendingReset}
                  className="flex-1 bg-purple-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2 transition-all"
                >
                  {sendingReset ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4" /> Send Reset Email</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
