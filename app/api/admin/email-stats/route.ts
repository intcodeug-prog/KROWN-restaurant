import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { getEmailStats } from '@/lib/services/email-log.service';
import { verifySmtpConfig } from '@/lib/services/email.service';

export async function GET(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(ctx.role, 'staff:view')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  try {
    const isSuperAdmin = ctx.role === 'super_admin' || ctx.isSuperAdmin;
    const stats = await getEmailStats(isSuperAdmin ? undefined : ctx.organizationId);
    const smtp = await verifySmtpConfig();

    return NextResponse.json({ success: true, data: { ...stats, smtpConfigured: smtp.ok, smtpError: smtp.error } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to get email stats' }, { status: 500 });
  }
}
