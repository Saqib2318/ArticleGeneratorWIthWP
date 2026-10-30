const styles: Record<string, string> = {
  pending: 'bg-zinc-800 text-zinc-400',
  generating: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  generated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  needs_review: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  published: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',
  scheduled: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  running: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] || styles.pending;
  return (
    <span
      className={`inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
