/**
 * articleService.ts (improved version)
 *
 * Install:   npm i googleapis axios @google/genai marked pg zod bullmq dotenv
 *            npm i -D @types/pg
 * Database:  run schema.sql once (Postgres + pgvector)
 * Env:       GEMINI_API_KEY, DATABASE_URL,
 *            GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
 * Sheet:     must be shared as EDITOR with the service-account email,
 *            because we now write the status back to the sheet.
 */
import { google, type docs_v1 } from 'googleapis';
import axios from 'axios';
import { GoogleGenAI, Type, type GenerateContentConfig } from '@google/genai';
import { marked } from 'marked';
import { Pool } from 'pg';
import { z } from 'zod';
import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import { getAuthedGoogleClient } from './google-oauth';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const WRITER_MODEL = 'gemini-2.5-flash';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768; // must match vector(768) in schema.sql
const SIMILARITY_LIMIT = 0.85; // cosine similarity at/above this = "too close to an old article"
const NO_THINKING: GenerateContentConfig = { thinkingConfig: { thinkingBudget: 0 } }; // cheaper for mechanical calls

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface ClusterRow {
  rowIndex: number;
  priority: string;
  category: string;
  pageType: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string;
  contentBoundary: string;
}

export interface WpConfig {
  wpUrl: string;
  username: string;
  applicationPassword: string;
  seoPlugin?: 'rankmath' | 'yoast';
}

export interface SeoData {
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
}

export interface GeneratedArticle {
  title: string;
  markdown: string;
  summary: string;
  headings: string[];
  seo: SeoData;
  wordCount: number;
  duplicateRisk: boolean;
  similarTo?: string;
}

export interface GenerateOptions {
  projectId: string;
  systemInstructions: string;
  targetWords?: number; // default 1500
  research?: boolean; // optional web research step (costs extra)
}

interface PastArticle {
  title: string;
  summary: string;
  headings: string[];
  similarity: number;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); // 1s, 2s, 4s
    }
  }
  throw lastErr;
}

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
const clip = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '').trim());
const cleanMarkdown = (s: string) => s.replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/, '').trim();
const extractHeadings = (md: string) =>
  [...md.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim());

export const extractSpreadsheetId = (urlOrId: string) =>
  urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? urlOrId;
export const extractDocId = (urlOrId: string) =>
  urlOrId.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? urlOrId;

async function generateText(prompt: string, config: GenerateContentConfig = {}): Promise<string> {
  const res = await withRetry(() => ai.models.generateContent({ model: WRITER_MODEL, contents: prompt, config }));
  const text = res.text?.trim();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

/* ------------------------------------------------------------------ */
/* Google auth + Sheet                                                 */
/* ------------------------------------------------------------------ */

const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';
const auth = await getAuthedGoogleClient(DEV_OWNER_ID);
const sheets = google.sheets({ version: 'v4', auth });

// Keep the sheet layout in ONE place. Adjust to your real sheet.
const SHEET_NAME = 'Keyword Cluster Plan';
const COL = { priority: 0, category: 1, pageType: 2, title: 4, primaryKeyword: 5, secondaryKeywords: 8, contentBoundary: 10, status: 11 };
const STATUS_COL = 'L';
const LINK_COL = 'N'; // free column for the WP draft link (column M was left untouched on purpose)

/** 1. Next unprocessed rows. Accepts a spreadsheet ID or the full Google Sheets link. */
export async function fetchNextClusterRows(spreadsheetIdOrUrl: string, count: number): Promise<ClusterRow[]> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${SHEET_NAME}'!A2:N` }),
  );

  const out: ClusterRow[] = [];
  (res.data.values ?? []).forEach((row, i) => {
    const status = String(row[COL.status] ?? '').trim().toLowerCase();
    const title = String(row[COL.title] ?? '').trim();
    if (out.length >= count || !title || (status !== '' && status !== 'pending')) return;
    out.push({
      rowIndex: i + 2,
      priority: row[COL.priority] ?? '',
      category: row[COL.category] ?? '',
      pageType: row[COL.pageType] ?? '',
      title,
      primaryKeyword: row[COL.primaryKeyword] ?? '',
      secondaryKeywords: row[COL.secondaryKeywords] ?? '',
      contentBoundary: row[COL.contentBoundary] ?? '',
    });
  });
  return out;
}

/** Write status (+ optional link) back, so the same row is never picked twice. */
export async function setRowStatus(spreadsheetIdOrUrl: string, rowIndex: number, status: string, link?: string) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = [{ range: `'${SHEET_NAME}'!${STATUS_COL}${rowIndex}`, values: [[status]] }];
  if (link) data.push({ range: `'${SHEET_NAME}'!${LINK_COL}${rowIndex}`, values: [[link]] });
  await withRetry(() =>
    sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } }),
  );
}

/* ------------------------------------------------------------------ */
/* Knowledge store (pgvector): dedupe + project rules                  */
/* ------------------------------------------------------------------ */
async function embed(text: string): Promise<number[]> {
  const res = await withRetry(() =>
    ai.models.embedContent({ model: EMBED_MODEL, contents: text, config: { outputDimensionality: EMBED_DIMS } }),
  );
  const values = res.embeddings?.[0]?.values;
  if (!values) throw new Error('Embedding failed');
  return values;
}

const embeddingText = (title: string, summary: string, headings: string[]) =>
  `${title}\n${summary}\n${headings.join('\n')}`;

export async function findSimilarArticles(projectId: string, text: string, k = 5): Promise<PastArticle[]> {
  const vec = JSON.stringify(await embed(text));
  const { rows } = await db.query(
    `SELECT title, summary, headings, 1 - (embedding <=> $2::vector) AS similarity
       FROM articles
      WHERE project_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [projectId, vec, k],
  );
  return rows as PastArticle[];
}

export async function saveGeneratedArticle(projectId: string, row: ClusterRow, a: GeneratedArticle): Promise<number> {
  const vec = JSON.stringify(await embed(embeddingText(a.title, a.summary, a.headings)));
  const { rows } = await db.query(
    `INSERT INTO articles (project_id, sheet_row, title, primary_keyword, summary, headings, body_md, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector) RETURNING id`,
    [projectId, row.rowIndex, a.title, a.seo.focusKeyword, a.summary, a.headings, a.markdown, vec],
  );
  return rows[0].id as number;
}

export async function getProjectRules(projectId: string): Promise<string[]> {
  const { rows } = await db.query(
    'SELECT rule FROM project_rules WHERE project_id = $1 ORDER BY id DESC LIMIT 30',
    [projectId],
  );
  return rows.map((r) => r.rule as string);
}

/** Turns one review comment into a reusable rule that future articles will follow. */
export async function saveFeedbackAsRule(projectId: string, feedback: string): Promise<string | null> {
  const rule = await generateText(
    `Turn this editor feedback into ONE short, reusable writing rule (max 25 words) that prevents the same mistake in future articles of this project. ` +
      `If it is only about one specific fact or sentence and cannot be generalised, reply exactly NONE.\n\nFeedback: "${feedback}"`,
    NO_THINKING,
  );
  if (rule.toUpperCase().startsWith('NONE')) return null;
  await db.query('INSERT INTO project_rules (project_id, rule) VALUES ($1, $2)', [projectId, rule]);
  return rule;
}

/* ------------------------------------------------------------------ */
/* Article generation                                                  */
/* ------------------------------------------------------------------ */
/** Optional research step using Gemini's Google Search grounding. Keep it off unless needed. */
async function researchTopic(row: ClusterRow): Promise<string> {
  return generateText(
    `Find current, factual information for an article titled "${row.title}" (keyword: ${row.primaryKeyword}). ` +
      `Return 8-10 short bullet points with concrete facts, figures and rules. State which country/jurisdiction each point applies to.`,
    { tools: [{ googleSearch: {} }] },
  );
}

const formatPast = (list: PastArticle[]) =>
  list.map((a) => `- "${a.title}" | headings: ${(a.headings ?? []).join('; ')} | summary: ${a.summary}`).join('\n');

function buildWriterPrompt(
  row: ClusterRow,
  o: { systemInstructions: string; targetWords: number; rules: string[]; similar: PastArticle[]; notes: string },
): string {
  return `
${o.systemInstructions}

PROJECT RULES (learned from past editor feedback - always follow):
${o.rules.length ? o.rules.map((r) => `- ${r}`).join('\n') : '- none yet'}

ALREADY WRITTEN ON THIS SITE (closest to this topic):
${o.similar.length ? formatPast(o.similar) : '- none yet'}
Do NOT re-explain anything these articles already cover (mention it in one short sentence at most).
Take a different angle and use different H2 headings.

${o.notes ? `RESEARCH NOTES (use these facts, do not invent figures or legal claims):\n${o.notes}\n` : ''}
ARTICLE TO WRITE:
- Title: ${row.title}
- Primary keyword: ${row.primaryKeyword}
- Secondary keywords: ${row.secondaryKeywords}
- Content boundary (stay inside it): ${row.contentBoundary}

REQUIREMENTS:
- About ${o.targetWords} words, in Markdown.
- Do not write the H1 title. Start with the introduction, then use H2/H3 headings.
- Where an image would help, add one line like: [IMAGE: short description for an image generator]. Use 3 to 5 of them.
- Output ONLY the article. No preface, no JSON, no code fences.
`.trim();
}

const metaSchema = z.object({
  summary: z.string().min(20),
  metaTitle: z.string().min(10),
  metaDescription: z.string().min(40),
});

/** Cheap structured call: summary + SEO text. The slug is built in code, not by the model. */
export async function generateSeoMetadata(title: string, markdown: string, primaryKeyword: string): Promise<SeoData & { summary: string }> {
  const raw = await generateText(
    `Article title: ${title}\nPrimary keyword: ${primaryKeyword}\n\nArticle:\n${markdown}\n\n` +
      `Return: summary (exactly 2 sentences), metaTitle (max 60 chars, include the primary keyword), metaDescription (max 155 chars, include the primary keyword, make people want to click).`,
    {
      ...NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          metaTitle: { type: Type.STRING },
          metaDescription: { type: Type.STRING },
        },
        required: ['summary', 'metaTitle', 'metaDescription'],
      },
    },
  );
  const m = metaSchema.parse(JSON.parse(raw));
  return {
    summary: m.summary,
    focusKeyword: primaryKeyword,
    metaTitle: clip(m.metaTitle, 60),
    metaDescription: clip(m.metaDescription, 155),
    slug: slugify(primaryKeyword || title),
  };
}

/** 2. Generate one article. Call it one-by-one: every saved article becomes context for the next. */
export async function generateFullArticleWithSEO(row: ClusterRow, opts: GenerateOptions): Promise<GeneratedArticle> {
  const targetWords = opts.targetWords ?? 1500;

  const [rules, similar, notes] = await Promise.all([
    getProjectRules(opts.projectId),
    findSimilarArticles(opts.projectId, `${row.title}\n${row.primaryKeyword}\n${row.contentBoundary}`),
    opts.research ? researchTopic(row) : Promise.resolve(''),
  ]);

  let markdown = cleanMarkdown(
    await generateText(buildWriterPrompt(row, { systemInstructions: opts.systemInstructions, targetWords, rules, similar, notes })),
  );

  // Flash often writes short. One expansion pass if it is clearly under target.
  if (countWords(markdown) < targetWords * 0.85) {
    markdown = cleanMarkdown(
      await generateText(
        `Expand this article to about ${targetWords} words by deepening the existing sections (examples, steps, common mistakes, FAQs). ` +
          `Do not add topics outside this boundary: ${row.contentBoundary}. Keep the same headings style and [IMAGE: ...] lines. ` +
          `Return the full article only.\n\n${markdown}`,
      ),
    );
  }

  const meta = await generateSeoMetadata(row.title, markdown, row.primaryKeyword);
  const headings = extractHeadings(markdown);

  // Dedupe check against what is already stored for this project.
  const [closest] = await findSimilarArticles(opts.projectId, embeddingText(row.title, meta.summary, headings), 1);

  return {
    title: row.title,
    markdown,
    summary: meta.summary,
    headings,
    seo: { focusKeyword: meta.focusKeyword, metaTitle: meta.metaTitle, metaDescription: meta.metaDescription, slug: meta.slug },
    wordCount: countWords(markdown),
    duplicateRisk: !!closest && closest.similarity >= SIMILARITY_LIMIT,
    similarTo: closest?.title,
  };
}

/** Whole batch: claims rows first, then generates ONE BY ONE (not parallel). */
export async function generateBatch(sheetUrl: string, opts: GenerateOptions, count: number) {
  const rows = await fetchNextClusterRows(sheetUrl, count);
  await Promise.all(rows.map((r) => setRowStatus(sheetUrl, r.rowIndex, 'generating')));

  const results: { row: ClusterRow; articleId: number; article: GeneratedArticle }[] = [];
  for (const row of rows) {
    try {
      const article = await generateFullArticleWithSEO(row, opts);
      const articleId = await saveGeneratedArticle(opts.projectId, row, article);
      await setRowStatus(sheetUrl, row.rowIndex, article.duplicateRisk ? 'needs_review' : 'generated');
      results.push({ row, articleId, article });
    } catch (err) {
      console.error(`Row ${row.rowIndex} failed:`, err);
      await setRowStatus(sheetUrl, row.rowIndex, 'failed');
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* WordPress                                                           */
/* ------------------------------------------------------------------ */
/**
 * IMPORTANT: Rank Math / Yoast meta is usually IGNORED by the REST API unless the keys are registered.
 * Add this once on each WordPress site (Code Snippets plugin or a small mu-plugin):
 *
 * add_action('init', function () {
 *   $keys = ['rank_math_title','rank_math_description','rank_math_focus_keyword',
 *            '_yoast_wpseo_title','_yoast_wpseo_metadesc','_yoast_wpseo_focuskw'];
 *   foreach ($keys as $key) {
 *     register_post_meta('post', $key, [
 *       'show_in_rest'  => true, 'single' => true, 'type' => 'string',
 *       'auth_callback' => function () { return current_user_can('edit_posts'); },
 *     ]);
 *   }
 * });
 */
type Publishable = Pick<GeneratedArticle, 'title' | 'markdown' | 'seo'>;

/** 3. Create a WordPress DRAFT (never publishes). */
export async function publishToWordPressDraft(wp: WpConfig, article: Publishable) {
  const html = await marked.parse(article.markdown); // WordPress needs HTML, not Markdown
  const base = wp.wpUrl.replace(/\/$/, '');

  const meta: Record<string, string> =
    wp.seoPlugin === 'yoast'
      ? {
          _yoast_wpseo_title: article.seo.metaTitle,
          _yoast_wpseo_metadesc: article.seo.metaDescription,
          _yoast_wpseo_focuskw: article.seo.focusKeyword,
        }
      : {
          rank_math_title: article.seo.metaTitle,
          rank_math_description: article.seo.metaDescription,
          rank_math_focus_keyword: article.seo.focusKeyword,
        };

  const res = await axios.post(
    `${base}/wp-json/wp/v2/posts`,
    { title: article.title, content: html, slug: article.seo.slug, status: 'draft', meta },
    { auth: { username: wp.username, password: wp.applicationPassword }, timeout: 30_000 },
  );

  // Verify the SEO meta really saved (WordPress silently drops unregistered keys).
  const saved = res.data?.meta ?? {};
  const missing = Object.keys(meta).filter((k) => !(k in saved));
  if (missing.length) console.warn(`WP draft ${res.data.id}: SEO meta not saved (${missing.join(', ')}). Register the meta keys (see comment above).`);

  return { id: res.data.id as number, link: res.data.link as string, editLink: `${base}/wp-admin/post.php?post=${res.data.id}&action=edit` };
}

/* ------------------------------------------------------------------ */
/* Google Docs import                                                  */
/* ------------------------------------------------------------------ */
function docToMarkdown(content: docs_v1.Schema$StructuralElement[]): string {
  const blocks: string[] = [];
  for (const el of content) {
    const p = el.paragraph;
    if (!p) continue;
    const text = (p.elements ?? []).map((e) => e.textRun?.content ?? '').join('').replace(/\n$/, '');
    if (!text.trim()) continue;
    const level = p.paragraphStyle?.namedStyleType?.match(/^HEADING_(\d)$/)?.[1];
    if (level) blocks.push(`${'#'.repeat(Number(level))} ${text}`);
    else if (p.bullet) blocks.push(`- ${text}`);
    else blocks.push(text);
  }
  return blocks.join('\n\n');
}

/** 4. Google Doc -> WordPress draft. Keeps headings/bullets and only generates the SEO text (cheap). */
export async function importAndPublishFromGDoc(docIdOrUrl: string, wp: WpConfig, primaryKeyword?: string) {
  const docs = google.docs({ version: 'v1', auth });
  const { data } = await withRetry(() => docs.documents.get({ documentId: extractDocId(docIdOrUrl) }));

  const title = data.title ?? 'Untitled Document';
  const markdown = docToMarkdown(data.body?.content ?? []);
  const meta = await generateSeoMetadata(title, markdown, primaryKeyword ?? title);

  return publishToWordPressDraft(wp, {
    title,
    markdown,
    seo: { focusKeyword: meta.focusKeyword, metaTitle: meta.metaTitle, metaDescription: meta.metaDescription, slug: meta.slug },
  });
}

/* ------------------------------------------------------------------ */
/* Review feedback -> fixed article + saved rule                       */
/* ------------------------------------------------------------------ */
/** 5. Fix the EXISTING article using the reviewer's feedback, and remember the lesson for future articles. */
export async function rewriteAndFixRowArticle(
  projectId: string,
  currentMarkdown: string,
  feedback: string,
  systemInstructions: string,
): Promise<string> {
  await saveFeedbackAsRule(projectId, feedback);
  const rules = await getProjectRules(projectId);

  return cleanMarkdown(
    await generateText(
      `${systemInstructions}\n\nPROJECT RULES:\n${rules.map((r) => `- ${r}`).join('\n')}\n\n` +
        `Below is an article and the editor's feedback. Fix exactly what the feedback asks for, keep everything else (headings, [IMAGE: ...] lines, length) as close to the original as possible. ` +
        `Return the full corrected article in Markdown only.\n\nFEEDBACK: "${feedback}"\n\nARTICLE:\n${currentMarkdown}`,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Scheduling (BullMQ instead of node-cron)                            */
/* ------------------------------------------------------------------ */
/** Pakistan has no daylight saving, so +05:00 is always correct. pktToDate('2026-10-09', '14:30') */
export const pktToDate = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`);

/**
 * Create the WordPress draft at a given time. The job survives server restarts (stored in Redis).
 * Do NOT put WP credentials in the payload; the worker should load the WpConfig from your DB by projectId.
 */
export async function scheduleDraft(queue: Queue, payload: { projectId: string; articleId: number }, runAt: Date) {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  await queue.add('publish-draft', payload, {
    delay,
    jobId: `draft-${payload.articleId}`, // same article can't be scheduled twice
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true,
  });
  return { runAt: runAt.toISOString(), delayMs: delay };
}
