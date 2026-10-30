'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';

type ScheduleRow = {
  id: string;
  projectId: string;
  projectName: string;
  articleTitle: string;
  runAt: string;
  status: 'scheduled' | 'success' | 'failed' | 'running';
};

export default function SchedulesPage() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'success' | 'failed'>('all');

  useEffect(() => {
    // Placeholder until /api/schedules exists — wire to BullMQ later
    setRows([]);
  }, []);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const counts = {
    all: rows.length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    success: rows.filter((r) => r.status === 'success').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Draft jobs across all projects · PKT timezone · survives restarts
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'scheduled', 'success', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl">
            ⏰
          </div>
          <p className="text-lg font-medium text-zinc-300">No schedules yet</p>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            When you (or the agent) schedule a draft — e.g. “publish tomorrow at 2pm” — it will
            show up here with success / failed status after the job runs.
          </p>
          <Link
            href="/projects"
            className="mt-6 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Go to projects
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Article</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Run at (PKT)</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3 font-medium text-zinc-200">{r.articleTitle}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${r.projectId}`}
                      className="text-emerald-400/80 hover:text-emerald-300"
                    >
                      {r.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(r.runAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
