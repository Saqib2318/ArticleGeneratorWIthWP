'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Job = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: number;
  done: number;
  total: number;
  message?: string | null;
};

/**
 * Floating corner dock — shows active background jobs across the app.
 * Polls /api/jobs for all projects the user has open activity on.
 */
export default function ProgressDock() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const projects = await fetch('/api/projects').then((r) => r.json());
        if (!Array.isArray(projects) || cancelled) return;
        const active: Job[] = [];
        for (const p of projects.slice(0, 8)) {
          const list = await fetch(`/api/jobs?projectId=${p.id}`).then((r) => r.json());
          if (!Array.isArray(list)) continue;
          for (const j of list) {
            if (j.status === 'queued' || j.status === 'running') {
              active.push(j);
            }
          }
        }
        if (!cancelled) setJobs(active);
      } catch {
        // ignore
      }
    }

    tick();
    const t = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (jobs.length === 0) return null;

  const primary = jobs[0];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-80 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/50">
          <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
            Your progress
          </div>
          <ul className="max-h-64 overflow-y-auto p-2 space-y-1.5">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-lg bg-zinc-950/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-zinc-200">
                    {j.message || j.type}
                  </span>
                  <span className="shrink-0 text-[10px] text-emerald-400">{j.progress}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${j.progress || 5}%` }}
                  />
                </div>
                <Link
                  href={`/projects/${j.projectId}`}
                  className="mt-1 inline-block text-[10px] text-zinc-500 hover:text-emerald-400"
                >
                  Open project →
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-800 px-3 py-2">
            <Link href="/jobs" className="text-[11px] text-emerald-400 hover:underline">
              All background jobs
            </Link>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-emerald-300 shadow-lg shadow-emerald-900/30 hover:bg-zinc-800"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
        {jobs.length} job{jobs.length > 1 ? 's' : ''} · {primary.progress}%
      </button>
    </div>
  );
}
