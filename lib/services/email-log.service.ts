import { getSql } from '@/lib/neon-server';

export interface LogEmailParams {
  organizationId?: string;
  staffId?: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  status: 'sent' | 'failed' | 'queued';
  messageId?: string;
  errorMessage?: string;
  errorCategory?: string;
  metadata?: Record<string, any>;
}

export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const sql = getSql();
    const maskedEmail = maskEmail(params.recipientEmail);
    await sql`
      INSERT INTO email_logs (organization_id, staff_id, email_type, recipient_email, subject, status, message_id, error_message, error_category, metadata)
      VALUES (
        ${params.organizationId ?? null},
        ${params.staffId ?? null},
        ${params.emailType},
        ${maskedEmail},
        ${params.subject},
        ${params.status},
        ${params.messageId ?? null},
        ${params.errorMessage ?? null},
        ${params.errorCategory ?? null},
        ${JSON.stringify(params.metadata ?? {})}
      )
    `;
  } catch (e) {
    console.warn('[EmailLog] Failed to write email log:', e);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `**@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
}

export async function getEmailStats(organizationId?: string): Promise<{ sent: number; failed: number; today: number }> {
  const sql = getSql();
  let sentResult: any[], failedResult: any[], todayResult: any[];

  if (organizationId) {
    sentResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE organization_id = ${organizationId} AND status = 'sent'`;
    failedResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE organization_id = ${organizationId} AND status = 'failed'`;
    todayResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE organization_id = ${organizationId} AND created_at >= CURRENT_DATE`;
  } else {
    sentResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE status = 'sent'`;
    failedResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE status = 'failed'`;
    todayResult = await sql`SELECT COUNT(*)::int as c FROM email_logs WHERE created_at >= CURRENT_DATE`;
  }

  return {
    sent: (sentResult as any[])[0]?.c ?? 0,
    failed: (failedResult as any[])[0]?.c ?? 0,
    today: (todayResult as any[])[0]?.c ?? 0,
  };
}
