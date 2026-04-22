'use client';

import { useState, useMemo } from 'react';
import { MatchEvent, TeamData } from '@/types';
import { ko, fmtDate, formatKSTTime, recentForm } from '@/lib/football';

interface FootballPitchProps {
  homeTeam: TeamData & { name: string };
  awayTeam: TeamData & { name: string };
  event: MatchEvent;
  allEvents: MatchEvent[];
  myTeam?: string | null;
  onMyTeamSet?: (teamKo: string | null) => void;
}

function FormBadge({ result }: { result: string }) {
  const label = result === 'W' ? '승' : result === 'D' ? '무' : result === 'L' ? '패' : result;
  const cls =
    result === 'W'
      ? 'form-badge form-badge-W'
      : result === 'D'
      ? 'form-badge form-badge-D'
      : result === 'L'
      ? 'form-badge form-badge-L'
      : 'form-badge form-badge-dash';
  return <span className={cls}>{label}</span>;
}

function computeStandings(events: MatchEvent[]): Record<string, { rank: number; points: number }> {
  const pts: Record<string, number> = {};
  for (const e of events) {
    if (!e.intHomeScore || e.intHomeScore === '' || !e.intAwayScore) continue;
    const hs = parseInt(e.intHomeScore);
    const as_ = parseInt(e.intAwayScore);
    pts[e.strHomeTeam] = pts[e.strHomeTeam] ?? 0;
    pts[e.strAwayTeam] = pts[e.strAwayTeam] ?? 0;
    if (hs > as_) pts[e.strHomeTeam] += 3;
    else if (hs < as_) pts[e.strAwayTeam] += 3;
    else { pts[e.strHomeTeam]++; pts[e.strAwayTeam]++; }
  }
  const sorted = Object.entries(pts).sort((a, b) => b[1] - a[1]);
  const result: Record<string, { rank: number; points: number }> = {};
  sorted.forEach(([name, p], i) => { result[name] = { rank: i + 1, points: p }; });
  return result;
}

function BadgeImg({
  badge,
  name,
  size = 56,
}: {
  badge?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!badge || failed) {
    return (
      <span
        className="team-badge-fallback text-base font-bold"
        style={{ width: size, height: size, minWidth: size }}
      >
        {ko(name).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={badge}
      alt={ko(name)}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  );
}

export default function FootballPitch({
  homeTeam,
  awayTeam,
  event,
  allEvents,
  myTeam,
  onMyTeamSet,
}: FootballPitchProps) {
  const isPlayed =
    event.intHomeScore !== null &&
    event.intHomeScore !== undefined &&
    event.intHomeScore !== '';

  const homeForm = recentForm(homeTeam.name, allEvents);
  const awayForm = recentForm(awayTeam.name, allEvents);

  // API는 상위 5팀만 반환 → 나머지 팀은 allEvents에서 계산
  const computed = useMemo(() => computeStandings(allEvents), [allEvents]);
  const homeRank = homeTeam.rank ?? computed[homeTeam.name]?.rank;
  const homePoints = homeTeam.points ?? computed[homeTeam.name]?.points;
  const awayRank = awayTeam.rank ?? computed[awayTeam.name]?.rank;
  const awayPoints = awayTeam.points ?? computed[awayTeam.name]?.points;

  const timeKST = formatKSTTime(event.strTime ?? null);
  const dateStr = fmtDate(event.dateEvent);

  return (
    <div
      className="relative w-full overflow-hidden rounded-t-xl"
      style={{ minHeight: 240 }}
    >
      {/* 잔디 배경 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(90deg, #2f7d32 0px, #2f7d32 40px, #276b2a 40px, #276b2a 80px)',
        }}
      />

      {/* 흰 라인 레이어 */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 하프라인 */}
        <div
          className="absolute top-0 bottom-0 border-l-2 border-white/30"
          style={{ left: '50%' }}
        />
        {/* 센터서클 */}
        <div
          className="absolute border-2 border-white/20 rounded-full"
          style={{
            width: 80,
            height: 80,
            left: 'calc(50% - 40px)',
            top: 'calc(50% - 40px)',
          }}
        />
        {/* 왼쪽 페널티박스 */}
        <div
          className="absolute border-2 border-white/20"
          style={{ left: 0, top: '25%', width: 60, height: '50%' }}
        />
        {/* 오른쪽 페널티박스 */}
        <div
          className="absolute border-2 border-white/20"
          style={{ right: 0, top: '25%', width: 60, height: '50%' }}
        />
      </div>

      {/* 홈팀 오버레이 (왼쪽) */}
      <div
        className="absolute inset-y-0 left-0 w-1/2 flex flex-col items-center justify-center gap-2 py-4 px-3"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,90,95,0.55) 0%, rgba(255,90,95,0.15) 100%)',
        }}
      >
        <span className="text-[10px] font-bold text-[#ff5a5f] tracking-widest">HOME</span>
        <BadgeImg badge={homeTeam.badge} name={homeTeam.name} size={52} />
        <span className="text-sm font-bold text-white text-center leading-tight">
          {ko(homeTeam.name)}
        </span>
        {onMyTeamSet && (() => {
          const homeKo = ko(homeTeam.name);
          const isMyTeam = myTeam === homeKo;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onMyTeamSet(isMyTeam ? null : homeKo); }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors"
              style={{
                color: isMyTeam ? '#3ea6ff' : 'rgba(255,255,255,0.55)',
                borderColor: isMyTeam ? '#3ea6ff' : 'rgba(255,255,255,0.2)',
                background: isMyTeam ? 'rgba(62,166,255,0.15)' : 'rgba(0,0,0,0.2)',
              }}
              aria-label={isMyTeam ? '나의 팀 해제' : '나의 팀으로 등록'}
              aria-pressed={isMyTeam}
            >
              {isMyTeam ? '⚽ 나의 팀' : '⚽ 등록'}
            </button>
          );
        })()}
        {homeRank != null && (
          <span className="text-[11px] text-white/70">
            {homeRank}위 · {homePoints ?? '-'}점
          </span>
        )}
        <div className="flex gap-1 mt-1 flex-wrap justify-center">
          {homeForm.map((f, i) => (
            <FormBadge key={i} result={f} />
          ))}
        </div>
      </div>

      {/* 원정팀 오버레이 (오른쪽) */}
      <div
        className="absolute inset-y-0 right-0 w-1/2 flex flex-col items-center justify-center gap-2 py-4 px-3"
        style={{
          background:
            'linear-gradient(225deg, rgba(62,166,255,0.55) 0%, rgba(62,166,255,0.15) 100%)',
        }}
      >
        <span className="text-[10px] font-bold text-[#3ea6ff] tracking-widest">AWAY</span>
        <BadgeImg badge={awayTeam.badge} name={awayTeam.name} size={52} />
        <span className="text-sm font-bold text-white text-center leading-tight">
          {ko(awayTeam.name)}
        </span>
        {onMyTeamSet && (() => {
          const awayKo = ko(awayTeam.name);
          const isMyTeam = myTeam === awayKo;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onMyTeamSet(isMyTeam ? null : awayKo); }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors"
              style={{
                color: isMyTeam ? '#3ea6ff' : 'rgba(255,255,255,0.55)',
                borderColor: isMyTeam ? '#3ea6ff' : 'rgba(255,255,255,0.2)',
                background: isMyTeam ? 'rgba(62,166,255,0.15)' : 'rgba(0,0,0,0.2)',
              }}
              aria-label={isMyTeam ? '나의 팀 해제' : '나의 팀으로 등록'}
              aria-pressed={isMyTeam}
            >
              {isMyTeam ? '⚽ 나의 팀' : '⚽ 등록'}
            </button>
          );
        })()}
        {awayRank != null && (
          <span className="text-[11px] text-white/70">
            {awayRank}위 · {awayPoints ?? '-'}점
          </span>
        )}
        <div className="flex gap-1 mt-1 flex-wrap justify-center">
          {awayForm.map((f, i) => (
            <FormBadge key={i} result={f} />
          ))}
        </div>
      </div>

      {/* 상단 밴드 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-1.5 bg-black/50 text-[11px] text-white/80 flex-wrap">
        <span>{dateStr}</span>
        {timeKST && <span>⏱ {timeKST} KST</span>}
        {event.strVenue && <span>📍 {event.strVenue}</span>}
        {event.intRound && <span>R{event.intRound}</span>}
      </div>

      {/* 완료 경기: 최종 스코어 중앙 */}
      {isPlayed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 rounded-xl px-6 py-3 flex items-center gap-4">
            <span className="text-3xl font-black text-[#ff5a5f]">
              {event.intHomeScore}
            </span>
            <span className="text-xl font-bold text-white/60">:</span>
            <span className="text-3xl font-black text-[#3ea6ff]">
              {event.intAwayScore}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
