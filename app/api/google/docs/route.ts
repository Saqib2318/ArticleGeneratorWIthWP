import { NextResponse } from 'next/server';
import { listUserDocs, getGoogleConnectionStatus } from '@/lib/google-oauth';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

/** GET /api/google/docs — optional picker; URL/ID still works for shared docs */
export async function GET() {
  try {
    const status = await getGoogleConnectionStatus(DEV_OWNER_ID);
    if (!status.connected) {
      return NextResponse.json({ error: 'Google not connected', docs: [] }, { status: 401 });
    }
    const docs = await listUserDocs(DEV_OWNER_ID);
    return NextResponse.json({ docs, email: status.email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, docs: [] }, { status: 500 });
  }
}
