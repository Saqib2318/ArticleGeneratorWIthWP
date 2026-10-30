'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';

type Project = {
  id: string;
  name: string;
  description?: string;
  targetWords: number;
  researchEnabled: boolean;
  wpConfig?: { wpUrl: string; seoPlugin: string } | null;
  sheet?: { spreadsheetUrlOrId: string } | null;
  createdAt: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        else setError(data.error || 'Failed to load');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this project and all its articles?')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage sites, keyword sheets, and generation pipelines
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Project
        </Link>
      </div>

      {/* Stats strip */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total projects', value: projects.length },
            { label: 'With WordPress', value: projects.filter((p) => p.wpConfig).length },
            { label: 'With Sheets', value: projects.filter((p) => p.sheet).length },
            { label: 'Research on', value: projects.filter((p) => p.researchEnabled).length },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
            >
              <p className="text-2xl font-semibold text-white">{s.value}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-zinc-900/60" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl">
            📁
          </div>
          <p className="text-lg font-medium text-zinc-300">No projects yet</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-550 text-zinc-500">
            Create your first project, connect WordPress + Spreadsheet, and start generating.
          </p>
          <Link
            href="/projects/new"
            className="mt-6 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Create project
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition hover:border-zinc-700 hover:bg-zinc-900/70"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition group-hover:opacity-100" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white group-hover:text-emerald-300 transition">
                    {p.name}
                  </h2>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{p.description}</p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:bg-red-950/40 hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                  {p.targetWords} words
                </span>
                {p.wpConfig && (
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                    WP · {p.wpConfig.seoPlugin}
                  </span>
                )}
                {p.sheet && (
                  <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-400">
                    Sheet linked
                  </span>
                )}
                {p.researchEnabled && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                    Research
                  </span>
                )}
              </div>

              <p className="mt-3 text-[11px] text-zinc-600">
                Created {new Date(p.createdAt).toLocaleDateString()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
