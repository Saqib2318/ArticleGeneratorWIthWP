import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';
import { inngest } from '@/lib/inngest/client';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };

/** POST body: { docUrlOrId, primaryKeyword? } */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { docUrlOrId, primaryKeyword } = await req.json();
  try {
    await getProjectForOwner(id, DEV_OWNER_ID);
    const job = await prisma.backgroundJob.create({
      data: {
        projectId: id,
        type: 'import_gdoc',
        status: 'queued',
        total: 1,
        message: 'Queued: import Google Doc',
        payload: { docUrlOrId, primaryKeyword },
      },
    });
    await inngest.send({
      name: 'article/import-gdoc',
      data: { jobId: job.id, projectId: id, docUrlOrId, primaryKeyword },
    });
    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Import started in background.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}