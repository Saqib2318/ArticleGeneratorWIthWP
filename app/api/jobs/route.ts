import { NextRequest, NextResponse } from 'next/server';
import prisma  from '@/lib/prisma';

/** GET /api/jobs?projectId=xxx  — list jobs for a project */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const jobs = await prisma.backgroundJob.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return NextResponse.json(jobs);
}
