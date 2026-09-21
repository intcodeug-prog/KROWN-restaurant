import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { updateRole } from '@/lib/services/staff.service';
import { canManageStaff } from '@/lib/rbac';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json(
        { data: null, error: 'Role is required' },
        { status: 400 }
      );
    }

    if (!canManageStaff(user.role, role)) {
      return NextResponse.json(
        { data: null, error: 'Insufficient permissions to assign this role' },
        { status: 403 }
      );
    }

    const staff = await updateRole(ctx, id, role);
    return NextResponse.json({ data: staff });
  } catch (e: any) {
    return NextResponse.json(
      { data: null, error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}