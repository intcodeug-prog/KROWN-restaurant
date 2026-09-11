'use client';

import { useState } from 'react';

export function PlatformAdminLogin(){
  const [open,setOpen]=useState(false); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function login(){
    if(!email.trim()||!password){setError('Enter your admin email and password.');return;}
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j?.data?.staff||!j?.data?.token)throw new Error(j?.error||'Invalid administrator credentials.');
      const staff=j.data.staff;
      if(String(staff.role||'').toLowerCase().replace(/\s+/g,'_')!=='super_admin')throw new Error('This login is for platform administrators only.');
      localStorage.setItem('krown_session_token',j.data.token);localStorage.setItem('krown_staff_profile',JSON.stringify(staff));sessionStorage.setItem('krown_active_session','true');
      window.dispatchEvent(new CustomEvent('krown-authenticated',{detail:{staffId:staff.id,organizationId:staff.organization_id||staff.organizationId,branchId:staff.assigned_branch_id||staff.assignedBranchId}}));
      setOpen(false);
    }catch(e:any){setError(e?.message||'Unable to sign in.');}finally{setBusy(false);}
  }
  return <>
    <button onClick={()=>{setOpen(true);setError('')}} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10001] px-4 py-2 rounded-xl bg-white/90 dark:bg-[#17171B]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-lg text-[11px] font-bold text-slate-500 dark:text-slate-300">Platform Admin</button>
    {open&&<div className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-sm rounded-[2rem] bg-white dark:bg-[#121216] p-6 shadow-2xl border border-black/5 dark:border-white/10"><div className="mb-5"><h2 className="text-xl font-black text-slate-900 dark:text-white">Platform Admin</h2><p className="text-xs text-slate-500 mt-1">Administrator accounts do not require restaurant device activation.</p></div>{error&&<div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs font-semibold text-red-500">{error}</div>}<div className="space-y-3"><input autoFocus value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Admin email" className="w-full rounded-xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-3 text-sm outline-none"/><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" onKeyDown={e=>e.key==='Enter'&&login()} className="w-full rounded-xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-3 text-sm outline-none"/><div className="flex gap-2"><button onClick={()=>setOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-bold text-slate-600 dark:text-slate-300">Cancel</button><button disabled={busy} onClick={login} className="flex-1 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black disabled:opacity-60">{busy?'Signing in…':'Sign in'}</button></div></div></div></div>}
  </>;
}
