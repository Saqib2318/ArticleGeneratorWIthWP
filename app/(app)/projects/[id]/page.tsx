'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ActivityFeed, { type ActivityItem } from '@/components/ActivityFeed';
import StatusBadge from '@/components/StatusBadge';

type Project = {
  id: string;
  name: string;
  description?: string;
  systemInstructions: string;
  targetWords: number;
  researchEnabled: boolean;
  wpConfig?: { wpUrl: string; seoPlugin: string } | null;
  sheet?: { spreadsheetUrlOrId: string; sheetName: string } | null;
};

type Article = {
  id: number;
  title: string;
  primaryKeyword?: string;
  wordCount: number;
  duplicateRisk: boolean;
  status: string;
  wpLink?: string;
  createdAt: string;
};

type Schedule = {
  id: string;
  articleTitle: string;
  runAt: string;
  status: 'scheduled' | 'success' | 'failed' | 'running';
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [docUrl, setDocUrl] = useState('');
  const [batchCount, setBatchCount] = useState(3);
  const [tab, setTab] = useState<'articles' | 'pending' | 'schedules'>('articles');

  const pushActivity = useCallback((item: Omit<ActivityItem, 'id' | 'time'>) => {
    setActivity((prev) =>
      [{ ...item, id: Math.random().toString(36).slice(2), time: nowTime() }, ...prev].slice(0, 40),
    );
  }, []);

  async function load() {
    const [p, a] = await Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/projects/${id}/articles`).then((r) => r.json()),
    ]);
    setProject(p.error ? null : p);
    setArticles(Array.isArray(a) ? a : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setSchedules([]);
  }, [id]);

  async function loadPending() {
    pushActivity({ type: 'tool', tool: 'fetch_pending_rows', message: 'Fetching next pending rows…' });
    setBusy(true);
    try {
      const rows = await fetch(`/api/projects/${id}/pending-rows?count=8`).then((r) => r.json());
      if (Array.isArray(rows)) {
        setPending(rows);
        setTab('pending');
        pushActivity({
          type: 'success',
          message: `Found ${rows.length} pending row${rows.length === 1 ? '' : 's'}`,
          detail: rows.map((r: any) => r.title).join(' · ') || undefined,
        });
      } else {
        pushActivity({ type: 'error', message: rows.error || 'Failed to fetch rows' });
      }
    } catch (e: any) {
      pushActivity({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function runBatch() {
    pushActivity({ type: 'tool', tool: 'generate_batch', message: `Starting batch of ${batchCount} articles…` });
    pushActivity({ type: 'thinking', message: 'Agent generating sequentially…' });
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: batchCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      pushActivity({
        type: 'success',
        message: `Generated ${data.length} articles`,
        detail: data.map((d: any) => d.title).join(' · '),
      });
      await load();
      setTab('articles');
    } catch (e: any) {
      pushActivity({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft(articleId: number, title: string) {
    pushActivity({
      type: 'tool',
      tool: 'publish_wordpress_draft',
      message: `Creating WP draft for “${title}”…`,
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/publish-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      pushActivity({ type: 'success', message: 'WordPress draft created', detail: data.editLink });
      await load();
    } catch (e: any) {
      pushActivity({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function importDoc() {
    if (!docUrl.trim()) return;
    pushActivity({
      type: 'tool',
      tool: 'import_google_doc',
      message: 'Importing Google Doc → WP draft…',
      detail: docUrl,
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/import-gdoc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrlOrId: docUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      pushActivity({ type: 'success', message: 'Doc imported as draft', detail: data.editLink });
      setDocUrl('');
    } catch (e: any) {
      pushActivity({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-900/50" />
      </div>
    );
  }
  if (!project) return <p className="text-red-400">Project not found</p>;

  const stats = {
    total: articles.length,
    drafts: articles.filter((a) => a.status === 'published').length,
    review: articles.filter((a) => a.duplicateRisk || a.status === 'needs_review').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">{project.name}</h1>
          {project.description && (
            <p className="mt-1 max-w-lg text-sm text-zinc-500">{project.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            <input
              type="number"
              min={1}
              max={10}
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              className="w-12 bg-transparent px-2 text-center text-sm text-white focus:outline-none"
            />
            <button
              disabled={busy}
              onClick={runBatch}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
          <button
            disabled={busy}
            onClick={loadPending}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Pending rows
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <p className="text-[11px] text-zinc-500">WordPress</p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {project.wpConfig ? (
              <span className="text-emerald-400">Connected · {project.wpConfig.seoPlugin}</span>
            ) : (
              <span className="text-zinc-600">Not set</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <p className="text-[11px] text-zinc-500">Spreadsheet</p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {project.sheet ? <span className="text-sky-400">Linked</span> : <span className="text-zinc-600">Not set</span>}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <p className="text-[11px] text-zinc-500">Articles</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {stats.total} total · {stats.drafts} drafts
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <p className="text-[11px] text-zinc-500">Needs review</p>
          <p className="mt-0.5 text-sm font-medium text-amber-400">{stats.review}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Import Google Doc</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-zinc-700/80 bg-zinc-950/50 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                placeholder="Paste Docs URL or ID…"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
              />
              <button
                disabled={busy || !docUrl.trim()}
                onClick={importDoc}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"
              >
                Import
              </button>
            </div>
          </div>

          <div className="flex gap-1 border-b border-zinc-800">
            {(
              [
                ['articles', `Articles (${articles.length})`],
                ['pending', `Pending (${pending.length})`],
                ['schedules', `Schedules (${schedules.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm transition ${
                  tab === key
                    ? 'border-b-2 border-emerald-500 text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'articles' && (
            <div className="space-y-2">
              {articles.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-600">No articles yet. Hit Generate to start.</p>
              ) : (
                articles.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{a.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="text-[11px] text-zinc-500">{a.wordCount} words</span>
                        {a.duplicateRisk && <span className="text-[11px] text-amber-500">similar content</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {a.wpLink ? (
                        <a
                          href={a.wpLink}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20"
                        >
                          Open draft
                        </a>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => publishDraft(a.id, a.title)}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          → WP Draft
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'pending' && (
            <div className="space-y-2">
              {pending.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-600">Click “Pending rows” to load from the sheet.</p>
              ) : (
                pending.map((r) => (
                  <div key={r.rowIndex} className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                        #{r.rowIndex}
                      </span>
                      <p className="text-sm font-medium text-zinc-200">{r.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.primaryKeyword}
                      {r.category ? ` · ${r.category}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'schedules' && (
            <div className="space-y-2">
              {schedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center">
                  <p className="text-sm text-zinc-500">No scheduled drafts yet</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Use the agent: “Schedule this draft for tomorrow 2pm PKT”
                  </p>
                </div>
              ) : (
                schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.articleTitle}</p>
                      <p className="text-xs text-zinc-500">{new Date(s.runAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Live activity</p>
              </div>
              {activity.length > 0 && (
                <button onClick={() => setActivity([])} className="text-[10px] text-zinc-600 hover:text-zinc-400">
                  Clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ActivityFeed items={activity} />
            </div>
            {busy && (
              <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 pulse-dot" />
                  Working…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}