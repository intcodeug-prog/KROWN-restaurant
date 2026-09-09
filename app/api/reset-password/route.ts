import { NextRequest, NextResponse } from 'next/server';
import { completePasswordReset } from '@/lib/services/password-reset.service';

const MIN_PASSWORD_LENGTH = 5;

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token) return NextResponse.json({ success: false, error: 'Reset token is required' }, { status: 400 });
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ success: false, error: 'Password must be at least 5 characters' }, { status: 400 });
    }

    const result = await completePasswordReset(token, password);
    if (!result.success) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Failed to reset password' }, { status: 500 });
  }
}
