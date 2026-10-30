import { NextRequest, NextResponse } from 'next/server';
import { getProjectForOwner } from '@/lib/projects';
import { fetchNextClusterRows } from '@/lib/articleService';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };
/** GET /api/projects/:id/pending-rows?count=5 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const count = Number(req.nextUrl.searchParams.get('count') || 5);

  try {
    const project = await getProjectForOwner(id, DEV_OWNER_ID);
    if (!project.sheet) {
      return NextResponse.json({ error: 'Spreadsheet not configured' }, { status: 400 });
    }
    const rows = await fetchNextClusterRows(project.sheet.spreadsheetUrlOrId, count);
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}