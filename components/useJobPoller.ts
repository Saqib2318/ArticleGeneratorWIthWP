'use client';

import { useEffect, useRef, useCallback } from 'react';

export type JobStatus = {
  id: string;
  status: string;
  progress: number;
  done: number;
  total: number;
  message?: string | null;
  error?: string | null;
  result?: any;
};

/**
 * Poll /api/jobs/:id every `intervalMs` until completed/failed.
 * Calls onUpdate on each tick.
 */
export function useJobPoller(
  onUpdate: (job: JobStatus) => void,
  intervalMs = 2000,
) {
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const stop = useCallback((jobId: string) => {
    const t = timers.current.get(jobId);
    if (t) {
      clearInterval(t);
      timers.current.delete(jobId);
    }
  }, []);

  const start = useCallback(
    (jobId: string) => {
      stop(jobId);
      const tick = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (!res.ok) return;
          const job: JobStatus = await res.json();
          onUpdate(job);
          if (job.status === 'completed' || job.status === 'failed') {
            stop(jobId);
          }
        } catch {
          // ignore transient errors
        }
      };
      tick();
      const t = setInterval(tick, intervalMs);
      timers.current.set(jobId, t);
    },
    [onUpdate, intervalMs, stop],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearInterval(t));
      timers.current.clear();
    };
  }, []);

  return { start, stop };
}
