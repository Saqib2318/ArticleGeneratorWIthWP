import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// TODO: replace with real auth (JWT / NextAuth). For now fixed owner for local dev.
const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  systemInstructions: z.string().optional(),
  targetWords: z.number().int().min(500).max(5000).optional(),
  researchEnabled: z.boolean().optional(),
  wpConfig: z
    .object({
      wpUrl: z.string().url(),
      username: z.string().min(1),
      applicationPassword: z.string().min(1),
      seoPlugin: z.enum(['rankmath', 'yoast']).optional(),
    })
    .optional(),
  sheet: z
    .object({
      spreadsheetUrlOrId: z.string().min(1),
      sheetName: z.string().optional(),
    })
    .optional(),
});

/** GET /api/projects – list my projects */
export async function GET() {
  const projects = await prisma.project.findMany({
    where: { ownerId: DEV_OWNER_ID },
    include: { wpConfig: true, sheet: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(projects);
}

/** POST /api/projects – create project */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = createSchema.parse(body);

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      systemInstructions: data.systemInstructions ?? '',
      targetWords: data.targetWords ?? 1500,
      researchEnabled: data.researchEnabled ?? false,
      ownerId: DEV_OWNER_ID,
      wpConfig: data.wpConfig
        ? {
            create: {
              wpUrl: data.wpConfig.wpUrl,
              username: data.wpConfig.username,
              applicationPassword: data.wpConfig.applicationPassword,
              seoPlugin: data.wpConfig.seoPlugin ?? 'rankmath',
            },
          }
        : undefined,
      sheet: data.sheet
        ? {
            create: {
              spreadsheetUrlOrId: data.sheet.spreadsheetUrlOrId,
              sheetName: data.sheet.sheetName ?? 'Keyword Cluster Plan',
            },
          }
        : undefined,
    },
    include: { wpConfig: true, sheet: true },
  });

  return NextResponse.json(project, { status: 201 });
}
