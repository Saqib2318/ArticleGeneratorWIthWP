'use client';

export type ActivityItem = {
  id: string;
  type: 'tool' | 'info' | 'success' | 'error' | 'thinking';
  tool?: string;
  message: string;
  time: string;
  detail?: string;
};

const toolIcons: Record<string, string> = {
  fetch_pending_rows: '📋',
  generate_article: '✍️',
  generate_batch: '📦',
  publish_wordpress_draft: '🚀',
  import_google_doc: '📄',
  rewrite_from_feedback: '🔧',
  schedule_draft: '⏰',
  set_row_status: '🏷️',
};

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-zinc-600">
        <div className="mb-3 text-3xl opacity-40">💬</div>
        <p className="text-sm">Activity will appear here</p>
        <p className="mt-1 text-xs text-zinc-600">Tool calls, generation progress, schedules…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <div key={item.id} className="slide-in rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-sm">
              {item.type === 'tool' && item.tool
                ? toolIcons[item.tool] || '⚡'
                : item.type === 'success'
                  ? '✓'
                  : item.type === 'error'
                    ? '✕'
                    : item.type === 'thinking'
                      ? '…'
                      : 'ℹ'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-zinc-200">
                  {item.type === 'tool' && item.tool ? (
                    <span className="font-mono text-emerald-400/90">{item.tool}</span>
                  ) : (
                    item.message
                  )}
                </p>
                <span className="shrink-0 text-[10px] text-zinc-600">{item.time}</span>
              </div>
              {item.type === 'tool' && (
                <p className="mt-0.5 text-[11px] text-zinc-400">{item.message}</p>
              )}
              {item.detail && (
                <p className="mt-1 line-clamp-2 rounded bg-zinc-950/60 px-2 py-1 font-mono text-[10px] text-zinc-500">
                  {item.detail}
                </p>
              )}
              {item.type === 'thinking' && (
                <div className="mt-1.5 flex gap-1">
                  <span className="h-1 w-1 rounded-full bg-zinc-500 pulse-dot" />
                  <span className="h-1 w-1 rounded-full bg-zinc-500 pulse-dot" style={{ animationDelay: '0.2s' }} />
                  <span className="h-1 w-1 rounded-full bg-zinc-500 pulse-dot" style={{ animationDelay: '0.4s' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
