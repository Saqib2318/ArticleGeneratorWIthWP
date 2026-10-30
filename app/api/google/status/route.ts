import { NextResponse } from 'next/server';
import { getGoogleConnectionStatus, disconnectGoogle } from '@/lib/google-oauth';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

/** GET /api/google/status */
export async function GET() {
  const status = await getGoogleConnectionStatus(DEV_OWNER_ID);
  return NextResponse.json(status);
}

/** DELETE /api/google/status — disconnect */
export async function DELETE() {
  await disconnectGoogle(DEV_OWNER_ID);
  return NextResponse.json({ disconnected: true });
}
