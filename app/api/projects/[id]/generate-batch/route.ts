import { NextRequest, NextResponse } from 'next/server';
import prisma  from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';
import { inngest } from '@/lib/inngest/client';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };

/** POST body: { count, research?, targetWords? } */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const count = Math.min(Math.max(Number(body.count) || 3, 1), 10);
  const research = body.research === true;
  const targetWords = body.targetWords ? Number(body.targetWords) : undefined;

  try {
    const project = await getProjectForOwner(id, DEV_OWNER_ID);
    if (!project.sheet) {
      return NextResponse.json({ error: 'Spreadsheet not configured' }, { status: 400 });
    }

    const job = await prisma.backgroundJob.create({
      data: {
        projectId: id,
        type: 'generate_batch',
        status: 'queued',
        total: count,
        message: `Queued: ${count} articles${targetWords ? ` · ${targetWords} words` : ''}${research ? ' · research on' : ''}`,
        payload: { count, research, targetWords },
      },
    });

    await inngest.send({
      name: 'article/generate-batch',
      data: { jobId: job.id, projectId: id, count, research, targetWords },
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Background job started. You can switch projects or leave.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}