'use client';

import { useState } from 'react';
import { MatchEvent, TeamData } from '@/types';
import { ko, formatKSTTime } from '@/lib/football';

interface MatchCardProps {
  event: MatchEvent;
  teamsByName: Record<string, TeamData>;
  onClick: () => void;
  myTeam?: string | null;
}

function TeamBadge({ badge, fallbackBadge, name, size = 44 }: { badge?: string | null; fallbackBadge?: string | null; name: string; size?: number }) {
  const [stage, setStage] = useState(0); // 0=primary, 1=fallback, 2=text
  const src = stage === 0 ? badge : stage === 1 ? fallbackBadge : null;
  if (!src) {
    return (
      <span
        className="team-badge-fallback text-[10px] font-bold"
        style={{ width: size, height: size, minWidth: size }}
      >
        {ko(name).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={ko(name)}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', minWidth: size }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}

export default function MatchCard({ event, teamsByName, onClick, myTeam }: MatchCardProps) {
  const isPlayed =
    event.intHomeScore !== null &&
    event.intHomeScore !== undefined &&
    event.intHomeScore !== '';

  const homeData = teamsByName[event.strHomeTeam];
  const awayData = teamsByName[event.strAwayTeam];
  const homeKo = ko(event.strHomeTeam);
  const awayKo = ko(event.strAwayTeam);
  const timeLabel = formatKSTTime(event.strTime ?? null);
  const isMyTeamMatch = myTeam != null && (homeKo === myTeam || awayKo === myTeam);

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left rounded-xl bg-[var(--panel)] px-4 py-3.5 transition-colors hover:bg-[var(--panel2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        isMyTeamMatch ? 'border-l-[3px] border-l-[#3ea6ff]' : '',
      ].join(' ')}
    >
      {/* 메인 행: 홈팀 | 스코어/시간 | 원정팀 */}
      <div className="flex items-center gap-3">
        {/* 홈팀 */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <TeamBadge badge={homeData?.badge} fallbackBadge={homeData?.fallbackBadge} name={event.strHomeTeam} size={44} />
          <span className={[
            'text-sm font-bold truncate',
            homeKo === myTeam ? 'text-[#3ea6ff]' : 'text-[var(--text)]',
          ].join(' ')}>{homeKo}</span>
        </div>

        {/* 스코어 or VS + 시간 */}
        <div className="shrink-0 w-[88px] text-center">
          {isPlayed ? (
            <span className="text-xl font-black text-[var(--win)] tabular-nums tracking-tight">
              {event.intHomeScore}–{event.intAwayScore}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] text-[var(--muted)] font-medium">VS</span>
              <span className="text-sm text-[var(--accent)] font-bold">{timeLabel}</span>
            </div>
          )}
        </div>

        {/* 원정팀 */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
          <span className={[
            'text-sm font-bold truncate text-right',
            awayKo === myTeam ? 'text-[#3ea6ff]' : 'text-[var(--text)]',
          ].join(' ')}>{awayKo}</span>
          <TeamBadge badge={awayData?.badge} fallbackBadge={awayData?.fallbackBadge} name={event.strAwayTeam} size={44} />
        </div>
      </div>

      {/* 하단: 라운드 | 경기장 */}
      <div className="flex items-center justify-between mt-2.5">
        <div>
          {event.intRound && (
            <span className="text-[10px] font-bold bg-[var(--panel2)] text-[var(--muted)] px-2 py-0.5 rounded">
              R{event.intRound}
            </span>
          )}
        </div>
        {event.strVenue && (
          <span className="text-[10px] text-[var(--muted)] truncate max-w-[55%] text-right">
            {event.strVenue}
          </span>
        )}
      </div>
    </button>
  );
}
