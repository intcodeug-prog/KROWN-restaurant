import { sendEmail } from './email.service';
import { welcomeEmail } from './email-templates';
import { logEmail } from './email-log.service';
import { logAuditEvent } from '@/lib/audit';

export async function sendWelcomeEmail(opts: {
  staffId: string;
  staffName: string;
  email: string;
  restaurantName: string;
  role: string;
  organizationId: string;
  tempPassword?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { staffId, staffName, email, restaurantName, role, organizationId, tempPassword } = opts;

  const emailContent = welcomeEmail({ staffName, email, restaurantName, role, tempPassword });
  const result = await sendEmail({ to: email, ...emailContent });

  await logEmail({
    organizationId, staffId, emailType: 'welcome',
    recipientEmail: email, subject: emailContent.subject,
    status: result.success ? 'sent' : 'failed', messageId: result.messageId,
    errorMessage: result.error,
  }).catch(() => {});

  if (!result.success) return { success: false, error: result.error || 'Failed to send welcome email' };

  await logAuditEvent({
    organizationId, userId: staffId, userEmail: email,
    actorRole: 'staff', action: 'WELCOME_EMAIL_SENT',
    targetType: 'staff', targetId: staffId,
    details: { restaurantName, role },
  }).catch(() => {});

  return { success: true };
}
