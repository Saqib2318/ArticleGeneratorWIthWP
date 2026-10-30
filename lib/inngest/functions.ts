import { inngest } from './client';
import  prisma  from '@/lib/prisma';
import { getProjectForOwner } from '@/lib/projects';
import {
  fetchNextClusterRows,
  setRowStatus,
  generateFullArticleWithSEO,
  saveGeneratedArticle,
  publishToWordPressDraft,
  importAndPublishFromGDoc,
  rewriteAndFixRowArticle,
} from '@/lib/articleService';

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

async function updateJob(
  jobId: string,
  data: {
    status?: string;
    progress?: number;
    done?: number;
    total?: number;
    message?: string;
    error?: string;
    result?: any;
  },
) {
  await prisma.backgroundJob.update({ where: { id: jobId }, data });
}

/* ─── generate batch ─────────────────────────────────────────────────────── */
export const generateBatchJob = inngest.createFunction(
  {
    id: 'generate-batch',
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: 'article/generate-batch' }],
  },
  async ({ event, step }) => {
    const { jobId, projectId, count, research, targetWords } = event.data as {
      jobId: string;
      projectId: string;
      count: number;
      research?: boolean;
      targetWords?: number;
    };

    await step.run('mark-running', async () => {
      await updateJob(jobId, { status: 'running', message: 'Starting batch…', progress: 0 });
    });

    const project = await step.run('load-project', async () =>
      getProjectForOwner(projectId, DEV_OWNER_ID),
    );

    if (!project.sheet) {
      await updateJob(jobId, { status: 'failed', error: 'Spreadsheet not configured' });
      throw new Error('Spreadsheet not configured');
    }

    const sheetUrl = project.sheet.spreadsheetUrlOrId;
    const words = targetWords ?? project.targetWords ?? 1500;

    const rows = await step.run('claim-rows', async () => {
      const pending = await fetchNextClusterRows(sheetUrl, count);
      await Promise.all(pending.map((r) => setRowStatus(sheetUrl, r.rowIndex, 'generating')));
      await updateJob(jobId, {
        total: pending.length,
        done: 0,
        message: `Claimed ${pending.length} rows · ~${words} words each`,
      });
      return pending;
    });

    if (rows.length === 0) {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: 'No pending rows',
        result: [],
      });
      return { ok: true, results: [] };
    }

    const results: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const articleResult = await step.run(`generate-article-${row.rowIndex}`, async () => {
        try {
          const article = await generateFullArticleWithSEO(row, {
            projectId,
            systemInstructions: project.systemInstructions,
            targetWords: words,
            research: research ?? false,
          });
          const articleId = await saveGeneratedArticle(projectId, row, article);
          await prisma.generatedArticle.create({
            data: {
              projectId,
              sheetRow: row.rowIndex,
              title: article.title,
              primaryKeyword: article.seo.focusKeyword,
              summary: article.summary,
              markdown: article.markdown,
              headings: article.headings,
              seo: article.seo,
              wordCount: article.wordCount,
              duplicateRisk: article.duplicateRisk,
              similarTo: article.similarTo,
              status: article.duplicateRisk ? 'needs_review' : 'generated',
            },
          });
          await setRowStatus(
            sheetUrl,
            row.rowIndex,
            article.duplicateRisk ? 'needs_review' : 'generated',
          );
          return {
            ok: true,
            rowIndex: row.rowIndex,
            articleId,
            title: article.title,
            wordCount: article.wordCount,
            duplicateRisk: article.duplicateRisk,
          };
        } catch (err: any) {
          await setRowStatus(sheetUrl, row.rowIndex, 'failed');
          return { ok: false, rowIndex: row.rowIndex, error: err.message ?? String(err) };
        }
      });

      results.push(articleResult);
      const done = i + 1;
      await step.run(`progress-${done}`, async () => {
        await updateJob(jobId, {
          done,
          progress: Math.round((done / rows.length) * 100),
          message: articleResult.ok
            ? `Generated “${articleResult.title}” (${done}/${rows.length})`
            : `Failed row ${articleResult.rowIndex} (${done}/${rows.length})`,
        });
      });
    }

    await step.run('mark-done', async () => {
      const failed = results.filter((r) => !r.ok).length;
      await updateJob(jobId, {
        status: failed === results.length ? 'failed' : 'completed',
        progress: 100,
        message:
          failed > 0
            ? `Done: ${results.length - failed} ok, ${failed} failed`
            : `All ${results.length} articles generated`,
        result: results,
        error: failed === results.length ? 'All articles failed' : undefined,
      });
    });

    return { ok: true, results };
  },
);

/* ─── generate one ───────────────────────────────────────────────────────── */
export const generateOneJob = inngest.createFunction(
  {
    id: 'generate-one',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ event: 'article/generate-one' }],
  },
  async ({ event, step }) => {
    const { jobId, projectId, rowIndex, research, targetWords } = event.data as {
      jobId: string;
      projectId: string;
      rowIndex: number;
      research?: boolean;
      targetWords?: number;
    };

    await step.run('mark-running', async () => {
      await updateJob(jobId, {
        status: 'running',
        message: `Generating row ${rowIndex}…`,
        progress: 10,
        total: 1,
        done: 0,
      });
    });

    const result = await step.run('generate', async () => {
      const project = await getProjectForOwner(projectId, DEV_OWNER_ID);
      if (!project.sheet) throw new Error('Spreadsheet not configured');
      const sheetUrl = project.sheet.spreadsheetUrlOrId;
      const words = targetWords ?? project.targetWords ?? 1500;

      const rows = await fetchNextClusterRows(sheetUrl, 50);
      const row = rows.find((r) => r.rowIndex === rowIndex);
      if (!row) throw new Error(`Row ${rowIndex} not pending`);

      await setRowStatus(sheetUrl, row.rowIndex, 'generating');
      try {
        const article = await generateFullArticleWithSEO(row, {
          projectId,
          systemInstructions: project.systemInstructions,
          targetWords: words,
          research: research ?? false,
        });
        const articleId = await saveGeneratedArticle(projectId, row, article);
        await prisma.generatedArticle.create({
          data: {
            projectId,
            sheetRow: row.rowIndex,
            title: article.title,
            primaryKeyword: article.seo.focusKeyword,
            summary: article.summary,
            markdown: article.markdown,
            headings: article.headings,
            seo: article.seo,
            wordCount: article.wordCount,
            duplicateRisk: article.duplicateRisk,
            similarTo: article.similarTo,
            status: article.duplicateRisk ? 'needs_review' : 'generated',
          },
        });
        await setRowStatus(
          sheetUrl,
          row.rowIndex,
          article.duplicateRisk ? 'needs_review' : 'generated',
        );
        return {
          articleId,
          title: article.title,
          wordCount: article.wordCount,
          duplicateRisk: article.duplicateRisk,
        };
      } catch (err) {
        await setRowStatus(sheetUrl, row.rowIndex, 'failed');
        throw err;
      }
    });

    await step.run('mark-done', async () => {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        done: 1,
        message: `Generated “${result.title}”`,
        result,
      });
    });

    return result;
  },
);

/* ─── publish draft ──────────────────────────────────────────────────────── */
export const publishDraftJob = inngest.createFunction(
  {
    id: 'publish-draft',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ event: 'article/publish-draft' }],
  },
  async ({ event, step }) => {
    const { jobId, projectId, articleId } = event.data as {
      jobId: string;
      projectId: string;
      articleId: number;
    };

    await step.run('mark-running', async () => {
      await updateJob(jobId, {
        status: 'running',
        message: 'Publishing WP draft…',
        progress: 20,
        total: 1,
      });
    });

    const result = await step.run('publish', async () => {
      const project = await getProjectForOwner(projectId, DEV_OWNER_ID);
      if (!project.wpConfig) throw new Error('WordPress not configured');

      const article = await prisma.generatedArticle.findFirst({
        where: { id: articleId, projectId },
      });
      if (!article) throw new Error('Article not found');

      const wp = await publishToWordPressDraft(
        {
          wpUrl: project.wpConfig.wpUrl,
          username: project.wpConfig.username,
          applicationPassword: project.wpConfig.applicationPassword,
          seoPlugin: project.wpConfig.seoPlugin as 'rankmath' | 'yoast',
        },
        { title: article.title, markdown: article.markdown, seo: article.seo as any },
      );

      await prisma.generatedArticle.update({
        where: { id: articleId },
        data: { wpPostId: wp.id, wpLink: wp.editLink, status: 'published' },
      });

      if (article.sheetRow && project.sheet) {
        await setRowStatus(
          project.sheet.spreadsheetUrlOrId,
          article.sheetRow,
          'published',
          wp.editLink,
        );
      }

      return wp;
    });

    await step.run('mark-done', async () => {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        done: 1,
        message: `Draft ready: ${result.editLink}`,
        result,
      });
    });

    return result;
  },
);

/* ─── import Google Doc ──────────────────────────────────────────────────── */
export const importGDocJob = inngest.createFunction(
  {
    id: 'import-gdoc',
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: 'article/import-gdoc' }],
  },
  async ({ event, step }) => {
    const { jobId, projectId, docUrlOrId, primaryKeyword } = event.data as {
      jobId: string;
      projectId: string;
      docUrlOrId: string;
      primaryKeyword?: string;
    };

    await step.run('mark-running', async () => {
      await updateJob(jobId, {
        status: 'running',
        message: 'Importing Google Doc…',
        progress: 30,
        total: 1,
      });
    });

    const result = await step.run('import', async () => {
      const project = await getProjectForOwner(projectId, DEV_OWNER_ID);
      if (!project.wpConfig) throw new Error('WordPress not configured');
      return importAndPublishFromGDoc(
        docUrlOrId,
        {
          wpUrl: project.wpConfig.wpUrl,
          username: project.wpConfig.username,
          applicationPassword: project.wpConfig.applicationPassword,
          seoPlugin: project.wpConfig.seoPlugin as 'rankmath' | 'yoast',
        },
        primaryKeyword,
      );
    });

    await step.run('mark-done', async () => {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        done: 1,
        message: `Imported → ${result.editLink}`,
        result,
      });
    });

    return result;
  },
);

/* ─── rewrite from feedback ──────────────────────────────────────────────── */
export const rewriteJob = inngest.createFunction(
  {
    id: 'rewrite-article',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ event: 'article/rewrite' }],
  },
  async ({ event, step }) => {
    const { jobId, projectId, articleId, feedback } = event.data as {
      jobId: string;
      projectId: string;
      articleId: number;
      feedback: string;
    };

    await step.run('mark-running', async () => {
      await updateJob(jobId, {
        status: 'running',
        message: 'Rewriting article…',
        progress: 20,
        total: 1,
      });
    });

    const result = await step.run('rewrite', async () => {
      const project = await getProjectForOwner(projectId, DEV_OWNER_ID);
      const article = await prisma.generatedArticle.findFirst({
        where: { id: articleId, projectId },
      });
      if (!article) throw new Error('Article not found');

      const fixed = await rewriteAndFixRowArticle(
        projectId,
        article.markdown,
        feedback,
        project.systemInstructions,
      );
      const wordCount = fixed.trim().split(/\s+/).filter(Boolean).length;
      await prisma.generatedArticle.update({
        where: { id: articleId },
        data: { markdown: fixed, wordCount },
      });
      return { articleId, wordCount };
    });

    await step.run('mark-done', async () => {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        done: 1,
        message: `Rewritten · ${result.wordCount} words`,
        result,
      });
    });

    return result;
  },
);

export const inngestFunctions = [
  generateBatchJob,
  generateOneJob,
  publishDraftJob,
  importGDocJob,
  rewriteJob,
];
