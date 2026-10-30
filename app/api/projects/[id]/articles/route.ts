import { NextRequest, NextResponse } from 'next/server';
import prisma  from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/articles */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await getProjectForOwner(id, DEV_OWNER_ID);
    const articles = await prisma.generatedArticle.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        primaryKeyword: true,
        wordCount: true,
        duplicateRisk: true,
        status: true,
        wpPostId: true,
        wpLink: true,
        createdAt: true,
      },
    });
    return NextResponse.json(articles);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}