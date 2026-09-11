'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import POSPage from '@/components/pos';
import AdminPage from '@/components/admin';
import ManagerPage from '@/components/manager';
import KitchenPage from '@/components/kitchen';
import CashierDashboard from '@/components/cashier';
import SuperAdminDashboard from '@/components/super-admin';
import SuperAdminRestaurantAnalytics from '@/components/super-admin-restaurant-analytics';
import type { StaffMember } from '@/lib/mockData';
import { dataStore } from '@/lib/dataStore';
import '@/lib/dataStore-hardening';

type View = 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier' | 'super_admin';
function normalizeRole(role: string | null | undefined): StaffMember['role'] { const normalized=String(role||'').trim().toLowerCase(); const map:Record<string,StaffMember['role']>={super_admin:'Super Admin',admin:'Super Admin',restaurant_admin:'Restaurant Admin',branch_manager:'Branch Manager',manager:'Branch Manager',cashier:'Cashier',senior_waiter:'Senior Waiter',waiter:'Senior Waiter',head_chef:'Head Chef',chef:'Head Chef',kitchen_staff:'Kitchen Staff'}; return map[normalized]||(role as StaffMember['role'])||'Cashier'; }
function profileToStaff(value:any):StaffMember|null { if(!value?.id||!value?.email||!value?.role)return null; return {id:value.id,name:value.name||value.email.split('@')[0]||'Staff',email:value.email,role:normalizeRole(value.role),branch:value.branch||value.branch_name||'Branch',assignedBranchId:value.assignedBranchId||value.assigned_branch_id||null,status:value.status||'active',avatar:value.avatar}; }
function viewForRole(role:string):View { switch(normalizeRole(role)){case 'Super Admin':return 'super_admin';case 'Restaurant Admin':return 'admin';case 'Branch Manager':return 'manager';case 'Cashier':return 'cashier';case 'Head Chef':case 'Kitchen Staff':return 'kitchen';default:return 'pos';} }
export default function AppRouter(){
 const readSession=useCallback(()=>{if(typeof window==='undefined'||sessionStorage.getItem('krown_active_session')!=='true')return null;try{return profileToStaff(JSON.parse(localStorage.getItem('krown_staff_profile')||'null'));}catch{return null;}},[]);
 const [activeStaff,setActiveStaff]=useState<StaffMember|null>(()=>readSession()); const [view,setView]=useState<View>(()=>viewForRole(readSession()?.role||''));
 const applyStaff=useCallback((staff:StaffMember|null)=>{setActiveStaff(staff);setView(staff?viewForRole(staff.role):'pos');dataStore.setOnlineStaffPresence(staff?[{staffId:staff.id,email:staff.email,branch:staff.branch,assignedBranchId:staff.assignedBranchId}]:[]);},[]);
 useEffect(()=>{const sync=()=>applyStaff(readSession());const onAuthenticated=()=>{const staff=readSession();applyStaff(staff);if(staff&&navigator.onLine)dataStore.refresh().catch(()=>undefined);};const onStorage=(event:StorageEvent)=>{if(event.key==='krown_staff_profile'||event.key==='krown_session_token')sync();};const onSignedOut=()=>applyStaff(null);sync();window.addEventListener('krown-authenticated',onAuthenticated);window.addEventListener('krown-signed-out',onSignedOut);window.addEventListener('storage',onStorage);window.addEventListener('pageshow',sync);return()=>{window.removeEventListener('krown-authenticated',onAuthenticated);window.removeEventListener('krown-signed-out',onSignedOut);window.removeEventListener('storage',onStorage);window.removeEventListener('pageshow',sync);};},[applyStaff,readSession]);
 const navigate=useCallback((target:View)=>{const role=activeStaff?.role;if(!role)return;if(role==='Super Admin')return setView(target);if(role==='Restaurant Admin')return target==='admin'?setView(target):undefined;if(role==='Branch Manager')return target==='admin'?undefined:setView(target);if(role==='Cashier')return target==='admin'||target==='manager'?undefined:setView(target);if(role==='Senior Waiter')return target==='pos'?setView(target):undefined;if(role==='Head Chef'||role==='Kitchen Staff')return target==='kitchen'?setView(target):undefined;setView(target);},[activeStaff]);
 const commonProps=useMemo(()=>({user:activeStaff?{uid:activeStaff.id,displayName:activeStaff.name,email:activeStaff.email,photoURL:activeStaff.avatar,assignedBranchId:activeStaff.assignedBranchId}:null,setView:navigate,activeStaff}),[activeStaff,navigate]);
 if(!activeStaff)return <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C]" aria-hidden="true"/>;
 switch(view){case 'super_admin':return <><SuperAdminDashboard user={commonProps.user} setView={navigate} activeStaff={activeStaff}/><SuperAdminRestaurantAnalytics/></>;case 'admin':return <AdminPage user={commonProps.user} setView={navigate}/>;case 'manager':return <ManagerPage user={commonProps.user} setView={navigate}/>;case 'kitchen':return <KitchenPage setView={navigate} activeStaff={activeStaff}/>;case 'cashier':return <CashierDashboard setView={navigate} activeStaff={activeStaff}/>;default:return <POSPage user={commonProps.user} setView={navigate} activeStaff={activeStaff}/>;}
}
