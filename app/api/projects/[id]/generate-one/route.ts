import { NextRequest, NextResponse } from 'next/server';
import  prisma from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';
import { inngest } from '@/lib/inngest/client';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };
/** POST body: { rowIndex, research?, targetWords? } */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { rowIndex, research, targetWords } = await req.json();
  try {
    await getProjectForOwner(id, DEV_OWNER_ID);
    const job = await prisma.backgroundJob.create({
      data: {
        projectId: id,
        type: 'generate_one',
        status: 'queued',
        total: 1,
        message: `Queued: row ${rowIndex}`,
        payload: { rowIndex, research, targetWords },
      },
    });
    await inngest.send({
      name: 'article/generate-one',
      data: {
        jobId: job.id,
        projectId: id,
        rowIndex,
        research: research === true,
        targetWords: targetWords ? Number(targetWords) : undefined,
      },
    });
    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Background job started.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}