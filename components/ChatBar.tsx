'use client';

import { useState } from 'react';

const WORD_OPTIONS = [500, 800, 1000, 1200, 1500, 1800, 2000];

/**
 * Parse natural language for count + words.
 * "write 3 articles of 500 words" → { count: 3, words: 500 }
 * "generate 2 articles" → { count: 2, words: null }
 * "rewrite this" → null (not a generate intent)
 */
export function parseGenerateIntent(text: string): {
  count: number | null;
  words: number | null;
  research: boolean;
} | null {
  const t = text.toLowerCase();
  const isGenerate =
    /\b(generate|write|create|ban[ao]|likho|articles?|posts?)\b/.test(t) &&
    !/\b(rewrite|import|publish|schedule)\b/.test(t);
  if (!isGenerate) return null;

  const countMatch = t.match(/\b(\d+)\s*(articles?|posts?|rows?)?\b/);
  const wordsMatch = t.match(/\b(\d{3,4})\s*(words?|words? ka|word)\b/) ||
    t.match(/\b(words?|length)\s*[:=]?\s*(\d{3,4})\b/);

  let words: number | null = null;
  if (wordsMatch) {
    const n = Number(wordsMatch[1].length >= 3 ? wordsMatch[1] : wordsMatch[2]);
    if (n >= 300 && n <= 5000) words = n;
  }

  let count: number | null = null;
  if (countMatch) {
    const n = Number(countMatch[1]);
    if (n >= 1 && n <= 10) count = n;
  }

  const research = /\b(research|with research|research on|google search)\b/.test(t);

  return { count, words, research };
}

type Props = {
  onGenerate: (opts: { count: number; targetWords?: number; research: boolean; text: string }) => void;
  disabled?: boolean;
  defaultWords?: number;
};

export default function ChatBar({ onGenerate, disabled, defaultWords = 1500 }: Props) {
  const [text, setText] = useState('');
  const [words, setWords] = useState<number | 'auto'>('auto');
  const [research, setResearch] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;

    const parsed = parseGenerateIntent(text);
    const count = parsed?.count ?? 3;
    // Priority: explicit in message → dropdown → project default
    const targetWords =
      parsed?.words ??
      (words === 'auto' ? undefined : words) ??
      defaultWords;
    const useResearch = research || parsed?.research === true;

    onGenerate({
      count,
      targetWords,
      research: useResearch,
      text: text.trim(),
    });
    setText('');
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 shadow-lg"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Word length */}
        <div className="relative">
          <select
            value={words === 'auto' ? 'auto' : String(words)}
            onChange={(e) =>
              setWords(e.target.value === 'auto' ? 'auto' : Number(e.target.value))
            }
            className="appearance-none rounded-lg border border-zinc-700 bg-zinc-950 py-1.5 pl-2.5 pr-7 text-xs text-zinc-300 focus:border-emerald-500/50 focus:outline-none"
            title="Article length for this request"
          >
            <option value="auto">Words: auto (1500)</option>
            {WORD_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w} words
              </option>
            ))}
          </select>
        </div>

        {/* Research toggle */}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-600">
          <input
            type="checkbox"
            checked={research}
            onChange={(e) => setResearch(e.target.checked)}
            className="h-3 w-3 rounded border-zinc-600 text-emerald-500"
          />
          Research
        </label>

        <span className="text-[10px] text-zinc-600">
          Or type e.g. “3 articles of 500 words”
        </span>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
          placeholder='e.g. "Generate 3 articles" or "Write 2 posts of 800 words with research"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Run
        </button>
      </div>
    </form>
  );
}
