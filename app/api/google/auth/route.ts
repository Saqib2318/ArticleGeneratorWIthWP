import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google-oauth';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/google/auth?returnTo=/projects/xxx
 * Redirects user to Google consent screen.
 */
export async function GET(req: NextRequest) {
  try {
    const returnTo = req.nextUrl.searchParams.get('returnTo') || '/projects';
    // state = ownerId|returnTo (simple; use signed JWT in production)
    const state = `${DEV_OWNER_ID}|${returnTo}`;
    const url = getGoogleAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
