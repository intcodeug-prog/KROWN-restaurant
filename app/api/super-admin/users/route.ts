import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { hashPassword } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { logAuditEvent } from '@/lib/audit';
import { sendWelcomeEmail } from '@/lib/services/welcome-email.service';

const ROLE_MAP: Record<string, string> = {
  admin: 'restaurant_admin',
  restaurant_admin: 'restaurant_admin',
  branch_manager: 'branch_manager',
  manager: 'branch_manager',
  cashier: 'cashier',
  senior_waiter: 'senior_waiter',
  waiter: 'senior_waiter',
  head_chef: 'head_chef',
  kitchen_staff: 'kitchen_staff',
};

export async function GET(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx || ctx.role !== 'super_admin') return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  const sql = getSql();
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search')?.trim() || '';
  const role = searchParams.get('role')?.trim() || 'all';
  const status = searchParams.get('status')?.trim() || 'all';
  const orgId = searchParams.get('organizationId')?.trim() || 'all';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const offset = (page - 1) * limit;
  try {
    const searchPattern = search ? `%${search}%` : null;
    const users = await sql`
      SELECT
        s.id,
        s.name,
        s.email,
        s.phone,
        s.role,
        s.status,
        s.assigned_branch_id,
        s.organization_id,
        s.created_at,
        s.last_login_at,
        o.name AS organization_name,
        b.id AS branch_id,
        b.name AS branch_name,
        b.location AS branch_location,
        b.city AS branch_city
      FROM staff s
      LEFT JOIN organizations o ON o.id = s.organization_id
      LEFT JOIN branches b ON b.id = s.assigned_branch_id AND b.organization_id = s.organization_id
      WHERE (${searchPattern}::text IS NULL OR s.name ILIKE ${searchPattern} OR s.email ILIKE ${searchPattern} OR s.phone ILIKE ${searchPattern})
        AND (${role} = 'all' OR lower(s.role) = lower(${role}))
        AND (${status} = 'all' OR lower(s.status) = lower(${status}))
        AND (${orgId}::text = 'all' OR s.organization_id::text = ${orgId})
      ORDER BY s.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const countResult = await sql`
      SELECT COUNT(*)::int as total FROM staff s
      WHERE (${searchPattern}::text IS NULL OR s.name ILIKE ${searchPattern} OR s.email ILIKE ${searchPattern} OR s.phone ILIKE ${searchPattern})
        AND (${role} = 'all' OR lower(s.role) = lower(${role}))
        AND (${status} = 'all' OR lower(s.status) = lower(${status}))
        AND (${orgId}::text = 'all' OR s.organization_id::text = ${orgId})`;
    const response = NextResponse.json({ data: users, meta: { total: Number(countResult[0]?.total ?? 0), page, limit } });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx || ctx.role !== 'super_admin') return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim() || null;
    const roleInput = String(body.role || '').trim().toLowerCase();
    const role = ROLE_MAP[roleInput];
    const organizationId = String(body.organizationId || '').trim();
    const assignedBranchId = String(body.assignedBranchId || body.branchId || '').trim() || null;
    const password = String(body.password || '');
    if (!name || name.length < 2) return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    if (!role) return NextResponse.json({ error: 'Role must be Admin, Manager, Cashier, Waiter or Kitchen Staff' }, { status: 400 });
    if (!organizationId) return NextResponse.json({ error: 'Restaurant is required' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

    const sql = getSql();
    const org = await sql`SELECT id FROM organizations WHERE id=${organizationId} LIMIT 1`;
    if (!org.length) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    let branchName = null;
    if (assignedBranchId) {
      const branch = await sql`SELECT id, name FROM branches WHERE id=${assignedBranchId} AND organization_id=${organizationId} LIMIT 1`;
      if (!branch.length) return NextResponse.json({ error: 'Selected branch does not belong to this restaurant' }, { status: 400 });
      branchName = branch[0].name;
    }
    const duplicate = await sql`SELECT id FROM staff WHERE lower(email)=${email} LIMIT 1`;
    if (duplicate.length) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const pin = String(body.pin || '').trim();
    const pinHash = pin && pin.length >= 4 && pin.length <= 8 && /^\d+$/.test(pin) ? await hashPassword(pin) : null;
    const id = generateId();
    const rows = await sql`
      INSERT INTO staff (id, name, email, phone, role, branch, status, assigned_branch_id, organization_id, password_hash, password_argon2, pin_code, pin_argon2, email_verified, created_at, updated_at)
      VALUES (${id}, ${name}, ${email}, ${phone}, ${role}, ${branchName}, 'active', ${assignedBranchId}, ${organizationId}, ${passwordHash}, ${passwordHash}, ${pinHash ? null : null}, ${pinHash}, false, NOW(), NOW())
      RETURNING id, name, email, phone, role, status, assigned_branch_id, organization_id, created_at`;

    await logAuditEvent({ organizationId, userId: ctx.userId, userEmail: 'super_admin', actorRole: 'super_admin', action: 'SUPER_ADMIN_USER_CREATE', targetType: 'staff', targetId: id, details: { name, email, role, assignedBranchId } });

    const orgName = (await sql`SELECT name FROM organizations WHERE id = ${organizationId} LIMIT 1`)[0]?.name || 'Restaurant';
    sendWelcomeEmail({
      staffId: id, staffName: name, email, restaurantName: orgName,
      role: ROLE_MAP[role] || role, organizationId, tempPassword: password,
    }).catch(() => {});

    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 });
  }
}
