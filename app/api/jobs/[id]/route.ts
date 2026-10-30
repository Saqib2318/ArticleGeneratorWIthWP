import { NextRequest, NextResponse } from 'next/server';
import  prisma  from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };
/** GET /api/jobs/:id */
export async function GET(_req: NextRequest, { params }: Params) {
  const {id}= await params
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(job);
}