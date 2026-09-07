// KROWN POS — Staff CRUD + Role Management
import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';

export interface Staff { id:string; organization_id:string; name:string; email:string; phone?:string; id_type?:string; id_number?:string; role:string; assigned_branch_id?:string; status:'active'|'on_shift'|'off_shift'|'on_leave'|'paused'|'banned'; avatar?:string; created_at:number; updated_at:number; }
const ROLE_HIERARCHY: Record<string,number> = { super_admin:7, restaurant_admin:6, branch_manager:5, manager:5, head_chef:4, cashier:3, kitchen_staff:2, waiter:1, senior_waiter:2 };

export async function listStaff(ctx:TenantContext, branchId?:string):Promise<Staff[]> {
  const sql=getSql();
  if(ctx.isSuperAdmin){
    const rows=branchId&&branchId!=='all'
      ? await sql`SELECT s.id,s.organization_id,s.name,s.email,s.phone,s.id_type,s.id_number,s.role,s.assigned_branch_id,s.status,s.avatar,s.created_at,s.updated_at,o.name as org_name,(SELECT ss.last_active_at FROM staff_sessions ss WHERE ss.staff_id=s.id ORDER BY ss.last_active_at DESC LIMIT 1) as last_login_at FROM staff s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.assigned_branch_id=${branchId} AND s.role!='super_admin' ORDER BY s.name ASC`
      : await sql`SELECT s.id,s.organization_id,s.name,s.email,s.phone,s.id_type,s.id_number,s.role,s.assigned_branch_id,s.status,s.avatar,s.created_at,s.updated_at,o.name as org_name,(SELECT ss.last_active_at FROM staff_sessions ss WHERE ss.staff_id=s.id ORDER BY ss.last_active_at DESC LIMIT 1) as last_login_at FROM staff s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.role!='super_admin' ORDER BY s.name ASC`;
    return rows as Staff[];
  }
  await setTenantContext(sql,ctx.organizationId);
  const effectiveBranch=branchId||ctx.branchId||undefined;
  const rows=effectiveBranch
    ? await sql`SELECT s.id,s.organization_id,s.name,s.email,s.phone,s.id_type,s.id_number,s.role,s.assigned_branch_id,s.status,s.avatar,s.created_at,s.updated_at,o.name as org_name,(SELECT ss.last_active_at FROM staff_sessions ss WHERE ss.staff_id=s.id ORDER BY ss.last_active_at DESC LIMIT 1) as last_login_at FROM staff s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.organization_id=${ctx.organizationId} AND s.assigned_branch_id=${effectiveBranch} AND s.role!='super_admin' ORDER BY s.name ASC`
    : await sql`SELECT s.id,s.organization_id,s.name,s.email,s.phone,s.id_type,s.id_number,s.role,s.assigned_branch_id,s.status,s.avatar,s.created_at,s.updated_at,o.name as org_name,(SELECT ss.last_active_at FROM staff_sessions ss WHERE ss.staff_id=s.id ORDER BY ss.last_active_at DESC LIMIT 1) as last_login_at FROM staff s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.organization_id=${ctx.organizationId} AND s.role!='super_admin' ORDER BY s.name ASC`;
  return rows as Staff[];
}

export async function getStaff(ctx:TenantContext,staffId:string):Promise<Staff|null>{
  const sql=getSql(); if(!ctx.isSuperAdmin) await setTenantContext(sql,ctx.organizationId);
  const rows=ctx.isSuperAdmin
    ? await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId}`
    : await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;
  return rows.length?(rows[0] as Staff):null;
}

export async function createStaff(ctx:TenantContext,input:{name:string;email:string;phone?:string;pin?:string;password?:string;idType?:string;idNumber?:string;role:string;branchId?:string;avatar?:string;}):Promise<Staff>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId);
  const passwordHash=input.password?.trim()?await hashPassword(input.password.trim()):null;
  const hashedPin=input.pin?await hashPassword(input.pin):null;
  if(!passwordHash&&!hashedPin) throw new Error('A password or PIN is required');
  const id=generateId(); const branchId=input.branchId&&input.branchId!=='all'?input.branchId:ctx.branchId||null;
  await sql`INSERT INTO staff (id,organization_id,name,email,phone,pin_code,pin_argon2,id_type,id_number,role,assigned_branch_id,status,avatar,password_hash,password_argon2,created_at,updated_at) VALUES (${id},${ctx.organizationId},${input.name.trim()},${input.email.trim().toLowerCase()},${input.phone?.trim()||null},NULL,${hashedPin},${input.idType||null},${input.idNumber?.trim()||null},${input.role},${branchId},'active',${input.avatar||''},NULL,${passwordHash},NOW(),NOW())`;
  await logAudit(ctx.userId,'staff.create',{staffId:id,name:input.name,role:input.role},ctx.organizationId,ctx.branchId);
  const rows=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${id} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Staff;
}

export async function updateStaff(ctx:TenantContext,staffId:string,updates:Partial<Pick<Staff,'name'|'email'|'phone'|'id_type'|'id_number'|'role'|'assigned_branch_id'|'avatar'>>):Promise<Staff>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId);
  const existing=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;
  if(!existing.length) throw new Error('Staff not found');
  const fields:string[]=[]; const values:any[]=[];
  for(const [key,value] of Object.entries(updates)) if(value!==undefined){fields.push(key);values.push(key==='assigned_branch_id'&&value==='all'?null:value);}
  if(!fields.length)return existing[0] as Staff;
  const setClauses=fields.map((f,i)=>`${f} = $${i+1}`).join(', '); values.push(staffId,ctx.organizationId);
  await sql(`UPDATE staff SET ${setClauses},updated_at=NOW() WHERE id=$${fields.length+1} AND organization_id=$${fields.length+2}`,values);
  await logAudit(ctx.userId,'staff.update',{staffId,fields},ctx.organizationId,ctx.branchId);
  const rows=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Staff;
}

export async function deleteStaff(ctx:TenantContext,staffId:string):Promise<void>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const existing=await sql`SELECT id FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;if(!existing.length)throw new Error('Staff not found');await sql`DELETE FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;await logAudit(ctx.userId,'staff.delete',{staffId},ctx.organizationId,ctx.branchId);}

export async function updateRole(ctx:TenantContext,staffId:string,newRole:string):Promise<Staff>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const existing=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;if(!existing.length)throw new Error('Staff not found');const staff=existing[0] as Staff;const callerLevel=ROLE_HIERARCHY[ctx.role]||0;const targetLevel=ROLE_HIERARCHY[newRole]||0;if(targetLevel>callerLevel)throw new Error('Cannot assign a role higher than your own');await sql`UPDATE staff SET role=${newRole},updated_at=NOW() WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;await logAudit(ctx.userId,'staff.update_role',{staffId,from:staff.role,to:newRole},ctx.organizationId,ctx.branchId);const rows=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;return rows[0] as Staff;}

export async function updateStatus(ctx:TenantContext,staffId:string,status:Staff['status']):Promise<Staff>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const existing=await sql`SELECT id FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;if(!existing.length)throw new Error('Staff not found');await sql`UPDATE staff SET status=${status},updated_at=NOW() WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;await logAudit(ctx.userId,'staff.update_status',{staffId,status},ctx.organizationId,ctx.branchId);const rows=await sql`SELECT id,organization_id,name,email,phone,id_type,id_number,role,assigned_branch_id,status,avatar,created_at,updated_at FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;return rows[0] as Staff;}

export async function setPin(ctx:TenantContext,staffId:string,pin:string):Promise<void>{const sql=getSql();let targetOrg=ctx.organizationId;if(ctx.isSuperAdmin){const staff=await sql`SELECT id,organization_id FROM staff WHERE id=${staffId} LIMIT 1`;if(!staff.length)throw new Error('Staff not found');targetOrg=(staff[0] as any).organization_id;}else{await setTenantContext(sql,ctx.organizationId);const existing=await sql`SELECT id FROM staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;if(!existing.length)throw new Error('Staff not found');}const hashedPin=await hashPassword(pin);await sql`UPDATE staff SET pin_code=NULL,pin_argon2=${hashedPin},updated_at=NOW() WHERE id=${staffId} AND organization_id=${targetOrg}`;await logAudit(ctx.userId,'staff.set_pin',{staffId},targetOrg,ctx.branchId);}
export async function syncStaff(ctx:TenantContext):Promise<Staff[]>{return listStaff(ctx,ctx.branchId||undefined);}
