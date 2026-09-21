import { getSql } from '@/lib/neon-server';
import { setTenantContext } from '@/lib/tenant';
import type { TenantContext } from '@/lib/tenant';
import { isPlatformRole, normalizeRole } from '@/lib/rbac';

export interface Category { id:string; name:string; icon?:string; description?:string; sort_order:number; organization_id?:string; branch_id?:string; created_at:number; }

function branchWhere(ctx:TenantContext){return isPlatformRole(ctx.role)||normalizeRole(ctx.role)==='restaurant_admin' ? null : ctx.branchId;}

export async function listCategories(ctx:TenantContext):Promise<Category[]>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const b=branchWhere(ctx);const rows=b?await sql`SELECT * FROM categories WHERE organization_id=${ctx.organizationId} AND (branch_id=${b} OR branch_id IS NULL) ORDER BY sort_order ASC,name ASC`:await sql`SELECT * FROM categories WHERE organization_id=${ctx.organizationId} ORDER BY sort_order ASC,name ASC`;return rows as Category[];}

export async function createCategory(ctx:TenantContext,data:{name:string;icon?:string;description?:string;sort_order?:number}):Promise<Category>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const cleanName=data.name.trim();if(!cleanName)throw new Error('Category name is required');const duplicate=await sql`SELECT id FROM categories WHERE organization_id=${ctx.organizationId} AND branch_id IS NOT DISTINCT FROM ${ctx.branchId} AND lower(trim(name))=lower(trim(${cleanName})) LIMIT 1`;if(duplicate.length)throw new Error('Category already exists for this branch');const id=crypto.randomUUID();const rows=await sql`INSERT INTO categories(id,name,icon,description,sort_order,organization_id,branch_id,created_at) VALUES(${id},${cleanName},${data.icon||null},${data.description||null},${data.sort_order||0},${ctx.organizationId},${ctx.branchId},NOW()) RETURNING *`;return rows[0] as Category;}

export async function updateCategory(ctx:TenantContext,id:string,data:{name?:string;icon?:string;description?:string;sort_order?:number}):Promise<Category|null>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const b=branchWhere(ctx);const rows=b?await sql`UPDATE categories SET name=COALESCE(${data.name},name),icon=COALESCE(${data.icon},icon),description=COALESCE(${data.description},description),sort_order=COALESCE(${data.sort_order},sort_order) WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${b} RETURNING *`:await sql`UPDATE categories SET name=COALESCE(${data.name},name),icon=COALESCE(${data.icon},icon),description=COALESCE(${data.description},description),sort_order=COALESCE(${data.sort_order},sort_order) WHERE id=${id} AND organization_id=${ctx.organizationId} RETURNING *`;return rows[0]?(rows[0] as Category):null;}

export async function deleteCategory(ctx:TenantContext,id:string):Promise<void>{const sql=getSql();await setTenantContext(sql,ctx.organizationId);const b=branchWhere(ctx);if(b)await sql`DELETE FROM categories WHERE id=${id} AND organization_id=${ctx.organizationId} AND branch_id=${b}`;else await sql`DELETE FROM categories WHERE id=${id} AND organization_id=${ctx.organizationId}`;}
