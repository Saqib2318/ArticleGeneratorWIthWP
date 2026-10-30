'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STEPS = [
  { id: 1, title: 'Google', desc: 'Connect account' },
  { id: 2, title: 'Basics', desc: 'Name & voice' },
  { id: 3, title: 'WordPress', desc: 'Site & SEO' },
  { id: 4, title: 'Sheet', desc: 'Pick spreadsheet' },
  { id: 5, title: 'Review', desc: 'Confirm' },
];

const inputCls =
  'w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition';
const labelCls = 'mb-1.5 block text-xs font-medium text-zinc-400';

type SheetItem = { id: string; name: string; modifiedTime?: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [google, setGoogle] = useState<{ connected: boolean; email?: string | null }>({
    connected: false,
  });
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    systemInstructions: '',
    targetWords: 1500,
    researchEnabled: false,
    wpUrl: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'rankmath' as 'rankmath' | 'yoast',
    spreadsheetId: '',
    spreadsheetName: '',
    sheetName: 'Keyword Cluster Plan',
  });

  function set(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function loadGoogle() {
    try {
      const s = await fetch('/api/google/status').then((r) => r.json());
      setGoogle(s.connected ? { connected: true, email: s.email } : { connected: false });
      if (s.connected) {
        setSheetsLoading(true);
        const data = await fetch('/api/google/sheets').then((r) => r.json());
        setSheets(Array.isArray(data.sheets) ? data.sheets : []);
        setSheetsLoading(false);
      }
    } catch {
      setGoogle({ connected: false });
    }
  }

  useEffect(() => {
    loadGoogle();
  }, []);

  function canNext() {
    if (step === 1) return google.connected;
    if (step === 2) return form.name.trim().length > 0;
    if (step === 3) return true;
    if (step === 4) return !!form.spreadsheetId;
    return true;
  }

  async function handleCreate() {
    setLoading(true);
    setError('');
    const body: any = {
      name: form.name,
      description: form.description || undefined,
      systemInstructions: form.systemInstructions || undefined,
      targetWords: form.targetWords,
      researchEnabled: form.researchEnabled,
    };
    if (form.wpUrl && form.username && form.applicationPassword) {
      body.wpConfig = {
        wpUrl: form.wpUrl,
        username: form.username,
        applicationPassword: form.applicationPassword,
        seoPlugin: form.seoPlugin,
      };
    }
    if (form.spreadsheetId) {
      body.sheet = {
        spreadsheetUrlOrId: form.spreadsheetId,
        sheetName: form.sheetName || undefined,
      };
    }
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push(`/projects/${data.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href="/projects" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New Project</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connect Google once → pick sheet from dropdown → no manual share email
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-1.5 min-w-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                  step > s.id
                    ? 'bg-emerald-500 text-zinc-950'
                    : step === s.id
                      ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {step > s.id ? '✓' : s.id}
              </div>
              <span className={`hidden text-[9px] sm:block ${step === s.id ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mb-3 ${step > s.id ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl shadow-black/20">
        {/* Step 1: Google */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Connect Google</h2>
            <p className="text-sm text-zinc-500">
              Login with Google and allow Sheets + Docs + Drive. Phir aapki spreadsheets
              dropdown mein aa jayengi — har sheet pe service-account share ki zaroorat nahi.
            </p>
            {google.connected ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <p className="text-sm font-medium text-emerald-300">Connected</p>
                <p className="text-xs text-emerald-500/80 mt-0.5">{google.email || 'Google account'}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/google/status', { method: 'DELETE' });
                    setGoogle({ connected: false });
                    setSheets([]);
                  }}
                  className="mt-2 text-[11px] text-zinc-500 hover:text-red-400"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <a
                href={`/api/google/auth?returnTo=${encodeURIComponent('/projects/new')}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.2C9.6 39.1 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C40.1 35.9 44 30.5 44 24c0-1.3-.1-2.5-.4-3.5z" />
                </svg>
                Connect with Google
              </a>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Basics</h2>
            <div>
              <label className={labelCls}>Project name *</label>
              <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Fintech Blog PK" autoFocus />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Brand voice / system instructions</label>
              <textarea className={inputCls + ' min-h-[100px]'} value={form.systemInstructions} onChange={(e) => set('systemInstructions', e.target.value)} placeholder="Tone, locale, rules…" />
            </div>
            <p className="text-[11px] text-zinc-600">
              Article length & research chat se choose honge (project default 1500 words).
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">WordPress</h2>
              <span className="text-xs text-zinc-500">Optional</span>
            </div>
            <div>
              <label className={labelCls}>Site URL</label>
              <input className={inputCls} value={form.wpUrl} onChange={(e) => set('wpUrl', e.target.value)} placeholder="https://yoursite.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Username</label>
                <input className={inputCls} value={form.username} onChange={(e) => set('username', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>App password</label>
                <input type="password" className={inputCls} value={form.applicationPassword} onChange={(e) => set('applicationPassword', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['rankmath', 'yoast'] as const).map((p) => (
                <button key={p} type="button" onClick={() => set('seoPlugin', p)} className={`rounded-xl border px-3 py-2 text-sm capitalize ${form.seoPlugin === p ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>
                  {p === 'rankmath' ? 'Rank Math' : 'Yoast'}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Pick spreadsheet</h2>
            <p className="text-sm text-zinc-500">
              Aapke Google Drive se sheets load hoti hain. Select karo — URL paste ki zaroorat nahi.
            </p>
            {sheetsLoading ? (
              <p className="text-sm text-zinc-500">Loading sheets…</p>
            ) : sheets.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-500">
                Koi spreadsheet nahi mili. Google Drive mein sheet banao ya{' '}
                <button type="button" className="text-emerald-400 underline" onClick={loadGoogle}>
                  refresh
                </button>
                .
              </div>
            ) : (
              <div>
                <label className={labelCls}>Spreadsheet</label>
                <select
                  className={inputCls}
                  value={form.spreadsheetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const s = sheets.find((x) => x.id === id);
                    set('spreadsheetId', id);
                    set('spreadsheetName', s?.name || '');
                  }}
                >
                  <option value="">Select a sheet…</option>
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Tab name (worksheet)</label>
              <input className={inputCls} value={form.sheetName} onChange={(e) => set('sheetName', e.target.value)} placeholder="Keyword Cluster Plan" />
            </div>
            {form.spreadsheetId && (
              <p className="text-[11px] text-zinc-600 font-mono truncate">ID: {form.spreadsheetId}</p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-lg font-semibold">Review</h2>
            {[
              ['Google', google.email || 'Connected'],
              ['Name', form.name],
              ['Sheet', form.spreadsheetName || form.spreadsheetId || '—'],
              ['Tab', form.sheetName],
              ['WordPress', form.wpUrl || 'Not set'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-zinc-800/60 pb-2">
                <span className="text-zinc-500">{k}</span>
                <span className="truncate text-right text-zinc-200 max-w-[60%]">{v}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-8 flex justify-between">
          <button type="button" disabled={step === 1} onClick={() => setStep((s) => s - 1)} className="rounded-xl px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-30">
            Back
          </button>
          {step < 5 ? (
            <button type="button" disabled={!canNext()} onClick={() => setStep((s) => s + 1)} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40">
              Continue
            </button>
          ) : (
            <button type="button" disabled={loading} onClick={handleCreate} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
              {loading ? 'Creating…' : 'Create project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}