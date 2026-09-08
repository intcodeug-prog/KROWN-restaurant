import { NextRequest, NextResponse } from 'next/server';
import { verifyPasswordResetToken } from '@/lib/services/password-reset.service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });

  try {
    const result = await verifyPasswordResetToken(token);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ valid: false, error: 'Invalid token' }, { status: 400 });
  }
}
