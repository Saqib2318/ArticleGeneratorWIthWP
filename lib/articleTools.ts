/**
 * LangGraph tools – same as before, but now load config from Prisma.
 * Place this next to your agent code, or import from here.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { loadProjectConfig } from './projects';
import {
  fetchNextClusterRows,
  setRowStatus,
  generateFullArticleWithSEO,
  generateBatch,
  publishToWordPressDraft,
  importAndPublishFromGDoc,
  rewriteAndFixRowArticle,
  scheduleDraft,
  pktToDate,
  type GenerateOptions,
} from './articleService';
// import type { Queue } from 'bullmq';

// let draftQueue: Queue | null = null;
// export function setDraftQueue(q: Queue) {
//   draftQueue = q;
// }

export const fetchPendingRowsTool = tool(
  async ({ projectId, count }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const rows = await fetchNextClusterRows(cfg.sheetUrl, count);
    return JSON.stringify(
      rows.map((r) => ({
        rowIndex: r.rowIndex,
        title: r.title,
        primaryKeyword: r.primaryKeyword,
        category: r.category,
        pageType: r.pageType,
        priority: r.priority,
      })),
      null,
      2,
    );
  },
  {
    name: 'fetch_pending_rows',
    description: 'Fetch next N pending keyword-cluster rows from the project spreadsheet.',
    schema: z.object({
      projectId: z.string(),
      count: z.number().int().min(1).max(20).default(5),
    }),
  },
);

export const generateArticleTool = tool(
  async ({ projectId, rowIndex, research }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const rows = await fetchNextClusterRows(cfg.sheetUrl, 50);
    const row = rows.find((r) => r.rowIndex === rowIndex);
    if (!row) return JSON.stringify({ error: `Row ${rowIndex} not found or already processed` });

    await setRowStatus(cfg.sheetUrl, row.rowIndex, 'generating');
    try {
      const opts: GenerateOptions = {
        projectId,
        systemInstructions: cfg.systemInstructions,
        targetWords: cfg.targetWords ?? 1500,
        research: research ?? cfg.research ?? false,
      };
      const article = await generateFullArticleWithSEO(row, opts);
      await setRowStatus(
        cfg.sheetUrl,
        row.rowIndex,
        article.duplicateRisk ? 'needs_review' : 'generated',
      );
      return JSON.stringify({
        title: article.title,
        wordCount: article.wordCount,
        duplicateRisk: article.duplicateRisk,
        similarTo: article.similarTo,
        seo: article.seo,
        summary: article.summary,
        headings: article.headings,
        markdownPreview: article.markdown.slice(0, 400) + '…',
      });
    } catch (err: any) {
      await setRowStatus(cfg.sheetUrl, row.rowIndex, 'failed');
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: 'generate_article',
    description: 'Generate one full SEO article for a spreadsheet row.',
    schema: z.object({
      projectId: z.string(),
      rowIndex: z.number().int(),
      research: z.boolean().optional(),
    }),
  },
);

export const generateBatchTool = tool(
  async ({ projectId, count, research }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const results = await generateBatch(
      cfg.sheetUrl,
      {
        projectId,
        systemInstructions: cfg.systemInstructions,
        targetWords: cfg.targetWords ?? 1500,
        research: research ?? cfg.research ?? false,
      },
      count,
    );
    return JSON.stringify(
      results.map((r) => ({
        rowIndex: r.row.rowIndex,
        title: r.article.title,
        articleId: r.articleId,
        wordCount: r.article.wordCount,
        duplicateRisk: r.article.duplicateRisk,
      })),
      null,
      2,
    );
  },
  {
    name: 'generate_batch',
    description: 'Generate N articles sequentially (each becomes context for the next).',
    schema: z.object({
      projectId: z.string(),
      count: z.number().int().min(1).max(10).default(3),
      research: z.boolean().optional(),
    }),
  },
);

export const publishDraftTool = tool(
  async ({ projectId, title, markdown, seo }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const result = await publishToWordPressDraft(cfg.wp, { title, markdown, seo });
    return JSON.stringify({
      wpPostId: result.id,
      publicLink: result.link,
      editLink: result.editLink,
      message: 'Draft created (not published live).',
    });
  },
  {
    name: 'publish_wordpress_draft',
    description: 'Create a WordPress DRAFT from title + markdown + SEO.',
    schema: z.object({
      projectId: z.string(),
      title: z.string(),
      markdown: z.string(),
      seo: z.object({
        focusKeyword: z.string(),
        metaTitle: z.string(),
        metaDescription: z.string(),
        slug: z.string(),
      }),
    }),
  },
);

export const importGDocTool = tool(
  async ({ projectId, docUrlOrId, primaryKeyword }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const result = await importAndPublishFromGDoc(docUrlOrId, cfg.wp, primaryKeyword);
    return JSON.stringify({
      wpPostId: result.id,
      editLink: result.editLink,
      message: 'Google Doc imported → WP draft created.',
    });
  },
  {
    name: 'import_google_doc',
    description: 'Import a Google Doc and create a WordPress draft with auto SEO.',
    schema: z.object({
      projectId: z.string(),
      docUrlOrId: z.string(),
      primaryKeyword: z.string().optional(),
    }),
  },
);

export const rewriteFromFeedbackTool = tool(
  async ({ projectId, currentMarkdown, feedback }:any) => {
    const cfg = await loadProjectConfig(projectId);
    const fixed = await rewriteAndFixRowArticle(
      projectId,
      currentMarkdown,
      feedback,
      cfg.systemInstructions,
    );
    return JSON.stringify({
      fixedMarkdownPreview: fixed.slice(0, 500) + '…',
      fullMarkdown: fixed,
      message: 'Article fixed + reusable rule saved.',
    });
  },
  {
    name: 'rewrite_from_feedback',
    description: 'Fix article from editor feedback and learn a project rule.',
    schema: z.object({
      projectId: z.string(),
      currentMarkdown: z.string(),
      feedback: z.string(),
    }),
  },
);

// export const scheduleDraftTool = tool(
//   async ({ projectId, articleId, date, time }:any) => {
//     if (!draftQueue) {
//       return JSON.stringify({ error: 'Draft queue not configured' });
//     }
//     const runAt = pktToDate(date, time);
//     const result = await scheduleDraft(draftQueue, { projectId, articleId }, runAt);
//     return JSON.stringify({
//       scheduledFor: result.runAt,
//       delayMs: result.delayMs,
//     });
//   },
//   {
//     name: 'schedule_draft',
//     description: 'Schedule WP draft creation at a future PKT date/time.',
//     schema: z.object({
//       projectId: z.string(),
//       articleId: z.number().int(),
//       date: z.string().describe('YYYY-MM-DD'),
//       time: z.string().describe('HH:mm'),
//     }),
//   },
// );

export const setRowStatusTool = tool(
  async ({ projectId, rowIndex, status, link }:any) => {
    const cfg = await loadProjectConfig(projectId);
    await setRowStatus(cfg.sheetUrl, rowIndex, status, link);
    return JSON.stringify({ ok: true, rowIndex, status });
  },
  {
    name: 'set_row_status',
    description: 'Manually set spreadsheet row status.',
    schema: z.object({
      projectId: z.string(),
      rowIndex: z.number().int(),
      status: z.enum(['pending', 'generating', 'generated', 'needs_review', 'failed', 'published']),
      link: z.string().url().optional(),
    }),
  },
);

export const articleTools = [
  fetchPendingRowsTool,
  generateArticleTool,
  generateBatchTool,
  publishDraftTool,
  importGDocTool,
  rewriteFromFeedbackTool,
  // scheduleDraftTool,
  setRowStatusTool,
];

export default articleTools;
