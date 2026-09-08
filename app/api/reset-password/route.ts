import { NextRequest, NextResponse } from 'next/server';
import { completePasswordReset } from '@/lib/services/password-reset.service';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token) return NextResponse.json({ success: false, error: 'Reset token is required' }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });

    // Password strength check
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasDigit) {
      return NextResponse.json({ success: false, error: 'Password must contain uppercase, lowercase, and a number' }, { status: 400 });
    }

    const result = await completePasswordReset(token, password);
    if (!result.success) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Failed to reset password' }, { status: 500 });
  }
}
