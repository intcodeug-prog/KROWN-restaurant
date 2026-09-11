import { NextResponse } from 'next/server';

const KROWN_LOGO = 'https://iili.io/nK49crl.png';

export function GET() {
  return NextResponse.redirect(KROWN_LOGO, 308);
}
