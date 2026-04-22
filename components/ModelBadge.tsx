'use client';

function GeminiIcon({ size = 14 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/gemini-icon.svg" width={size} height={size} alt="Gemini" />
  );
}

function GroqIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="#F55036"
      fillRule="evenodd"
      aria-label="Groq"
    >
      <path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z" />
    </svg>
  );
}

function resolveProvider(model?: string, provider?: string): 'gemini' | 'groq' | null {
  if (model?.startsWith('gemini') || provider === 'gemini') return 'gemini';
  if (model?.includes('llama') || provider === 'groq') return 'groq';
  return null;
}

interface ModelBadgeProps {
  model?: string | null;
  provider?: string;
  cached?: boolean;
}

export default function ModelBadge({ model, provider, cached }: ModelBadgeProps) {
  const type = resolveProvider(model ?? undefined, provider);
  if (!type) return null;

  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--panel2)]">
      {type === 'gemini' ? <GeminiIcon /> : <GroqIcon />}
      <span className="text-[10px] text-[var(--muted)]">
        {type === 'gemini' ? 'Gemini' : 'Groq'}
      </span>
      {cached && <span className="text-[10px] text-[var(--muted)]">· 캐시됨</span>}
    </span>
  );
}
