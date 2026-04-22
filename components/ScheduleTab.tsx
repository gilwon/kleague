'use client';

interface ScheduleTabProps {
  activeLeague: 'k1' | 'k2';
  onChange: (league: 'k1' | 'k2') => void;
}

export default function ScheduleTab({ activeLeague, onChange }: ScheduleTabProps) {
  return (
    <div className="flex w-full border-b border-[var(--border)]">
      {(['k1', 'k2'] as const).map((key) => {
        const label = key === 'k1' ? 'K리그1' : 'K리그2';
        const isActive = activeLeague === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              'flex-1 py-3 text-sm font-semibold transition-colors min-h-[44px]',
              isActive
                ? 'border-b-2 border-[#3ea6ff] text-[#3ea6ff]'
                : 'text-[var(--muted)] hover:text-[var(--text)]',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
