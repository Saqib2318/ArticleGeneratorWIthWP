import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';
import { z } from 'zod';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/:id */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const project = await getProjectForOwner(id, DEV_OWNER_ID);
    return NextResponse.json(project);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}

/** DELETE /api/projects/:id */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await getProjectForOwner(id, DEV_OWNER_ID);
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}