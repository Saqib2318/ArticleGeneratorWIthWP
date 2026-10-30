import  prisma  from './prisma';
import type { WpConfig } from './articleService'; // your existing service

export async function getProjectForOwner(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    include: { wpConfig: true, sheet: true },
  });
  if (!project) throw new Error('Project not found or access denied');
  return project;
}

/** Used by LangGraph tools – secrets stay server-side */
export async function loadProjectConfig(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { wpConfig: true, sheet: true },
  });
  if (!p) throw new Error(`Project ${projectId} not found`);
  if (!p.wpConfig) throw new Error('WordPress config missing');
  if (!p.sheet) throw new Error('Spreadsheet not configured');

  const wp: WpConfig = {
    wpUrl: p.wpConfig.wpUrl,
    username: p.wpConfig.username,
    applicationPassword: p.wpConfig.applicationPassword,
    seoPlugin: p.wpConfig.seoPlugin as 'rankmath' | 'yoast',
  };

  return {
    systemInstructions: p.systemInstructions,
    sheetUrl: p.sheet.spreadsheetUrlOrId,
    wp,
    targetWords: p.targetWords,
    research: p.researchEnabled,
  };
}
