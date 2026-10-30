'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';

type Job = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: number;
  done: number;
  total: number;
  message?: string | null;
  error?: string | null;
  createdAt: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projectId, setProjectId] = useState('');

  // Load all recent jobs by fetching projects then their jobs — simple: ask for projectId
  // For now list via a query: user pastes project id or we load from last project
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then(async (projects) => {
        if (!Array.isArray(projects) || projects.length === 0) return;
        const all: Job[] = [];
        for (const p of projects.slice(0, 10)) {
          const res = await fetch(`/api/jobs?projectId=${p.id}`);
          const data = await res.json();
          if (Array.isArray(data)) {
            all.push(
              ...data.map((j: Job) => ({ ...j, projectName: p.name } as any)),
            );
          }
        }
        all.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setJobs(all);
      });
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Background Jobs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Article generation runs in the background — leave the page, switch projects, come back later.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
          <p className="text-zinc-400">No jobs yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Open a project and hit Generate — jobs will appear here.
          </p>
          <Link href="/projects" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
            Go to projects
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j: any) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">{j.type}</span>
                  <StatusBadge status={j.status} />
                </div>
                <p className="mt-1 text-sm text-zinc-200">{j.message || '—'}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  {j.projectName && (
                    <Link href={`/projects/${j.projectId}`} className="text-emerald-500/80 hover:underline">
                      {j.projectName}
                    </Link>
                  )}
                  {' · '}
                  {new Date(j.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="w-32">
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${j.progress || 0}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-[10px] text-zinc-500">
                  {j.done}/{j.total} · {j.progress}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}