import { NextResponse } from 'next/server';
import { listUserSpreadsheets, getGoogleConnectionStatus } from '@/lib/google-oauth';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

/** GET /api/google/sheets — dropdown list for project setup */
export async function GET() {
  try {
    const status = await getGoogleConnectionStatus(DEV_OWNER_ID);
    if (!status.connected) {
      return NextResponse.json({ error: 'Google not connected', sheets: [] }, { status: 401 });
    }
    const sheets = await listUserSpreadsheets(DEV_OWNER_ID);
    return NextResponse.json({ sheets, email: status.email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, sheets: [] }, { status: 500 });
  }
}
