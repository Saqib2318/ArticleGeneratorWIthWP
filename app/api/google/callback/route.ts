import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback } from '@/lib/google-oauth';

/**
 * GET /api/google/callback?code=...&state=ownerId|returnTo
 * Google redirects here after user consents.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') || '';
  const err = req.nextUrl.searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (err) {
    return NextResponse.redirect(`${base}/projects?google=error&reason=${encodeURIComponent(err)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/projects?google=error&reason=missing_code`);
  }

  const [ownerId, returnTo] = state.split('|');
  const safeReturn = returnTo?.startsWith('/') ? returnTo : '/projects';

  try {
    await handleGoogleCallback(code, ownerId || '00000000-0000-0000-0000-000000000001');
    return NextResponse.redirect(`${base}${safeReturn}?google=connected`);
  } catch (e: any) {
    return NextResponse.redirect(
      `${base}/projects?google=error&reason=${encodeURIComponent(e.message || 'callback_failed')}`,
    );
  }
}
