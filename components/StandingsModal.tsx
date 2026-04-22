'use client';

import { useMemo } from 'react';
import { MatchEvent, TeamData } from '@/types';
import { ko } from '@/lib/football';

interface StandingsModalProps {
  allEvents: MatchEvent[];
  teamsByName: Record<string, TeamData>;
  leagueKey: 'k1' | 'k2';
  onClose: () => void;
}

function computeFullStandings(
  events: MatchEvent[],
  teamsByName: Record<string, TeamData>
): Array<{ name: string; rank: number; played: number; win: number; draw: number; loss: number; gf: number; ga: number; gd: number; points: number }> {
  const stats: Record<string, { played: number; win: number; draw: number; loss: number; gf: number; ga: number }> = {};

  for (const e of events) {
    if (!e.intHomeScore || e.intHomeScore === '' || !e.intAwayScore) continue;
    const hs = parseInt(e.intHomeScore);
    const as_ = parseInt(e.intAwayScore);
    const home = e.strHomeTeam;
    const away = e.strAwayTeam;
    if (!stats[home]) stats[home] = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 };
    if (!stats[away]) stats[away] = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 };
    stats[home].played++; stats[away].played++;
    stats[home].gf += hs; stats[home].ga += as_;
    stats[away].gf += as_; stats[away].ga += hs;
    if (hs > as_) { stats[home].win++; stats[away].loss++; }
    else if (hs < as_) { stats[away].win++; stats[home].loss++; }
    else { stats[home].draw++; stats[away].draw++; }
  }

  // API 상위 5팀 rank/points 우선 사용, 나머지는 계산
  const result = Object.entries(stats).map(([name, s]) => {
    const apiData = teamsByName[name];
    return {
      name,
      rank: apiData?.rank ?? 999,
      played: apiData?.played ?? s.played,
      win: apiData?.win ?? s.win,
      draw: apiData?.draw ?? s.draw,
      loss: apiData?.loss ?? s.loss,
      gf: apiData?.goalsFor ?? s.gf,
      ga: apiData?.goalsAgainst ?? s.ga,
      gd: apiData?.goalDiff ?? (s.gf - s.ga),
      points: apiData?.points ?? (s.win * 3 + s.draw),
    };
  });

  // rank가 없는 팀(999)은 points, gd 기준으로 정렬해서 rank 재계산
  result.sort((a, b) => {
    if (a.rank !== 999 && b.rank !== 999) return a.rank - b.rank;
    if (a.rank !== 999) return -1;
    if (b.rank !== 999) return 1;
    return b.points - a.points || b.gd - a.gd;
  });
  result.forEach((r, i) => { if (r.rank === 999) r.rank = i + 1; });

  return result;
}

export default function StandingsModal({ allEvents, teamsByName, leagueKey, onClose }: StandingsModalProps) {
  const standings = useMemo(
    () => computeFullStandings(allEvents, teamsByName),
    [allEvents, teamsByName]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg bg-[var(--panel)] rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-bold text-[var(--text)]">
            {leagueKey === 'k1' ? 'K리그 1' : 'K리그 2'} 순위표
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:bg-white/10 text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 테이블 헤더 */}
        <div className="px-4 py-1.5 grid grid-cols-[20px_1fr_34px_26px_26px_26px_26px_26px_34px] gap-x-1.5 text-[10px] text-[var(--muted)] font-semibold border-b border-white/5">
          <span className="text-center">#</span>
          <span>팀</span>
          <span className="text-center">경기</span>
          <span className="text-center">승</span>
          <span className="text-center">무</span>
          <span className="text-center">패</span>
          <span className="text-center">득</span>
          <span className="text-center">실</span>
          <span className="text-center text-[var(--accent)]">승점</span>
        </div>

        {/* 순위 목록 */}
        <div className="overflow-y-auto flex-1">
          {standings.map((row, i) => (
            <div
              key={row.name}
              className={[
                'px-4 py-2 grid grid-cols-[20px_1fr_34px_26px_26px_26px_26px_26px_34px] gap-x-1.5 items-center text-[12px]',
                i % 2 === 0 ? '' : 'bg-white/[0.02]',
                row.rank <= 2 ? 'text-[var(--win)]' : row.rank <= 6 ? 'text-[var(--text)]' : 'text-[var(--muted)]',
              ].join(' ')}
            >
              <span className="font-bold text-center">{row.rank}</span>
              <span className="font-semibold truncate">{ko(row.name)}</span>
              <span className="text-center">{row.played}</span>
              <span className="text-center">{row.win}</span>
              <span className="text-center">{row.draw}</span>
              <span className="text-center">{row.loss}</span>
              <span className="text-center">{row.gf}</span>
              <span className="text-center">{row.ga}</span>
              <span className="text-center font-bold text-[var(--accent)]">{row.points}</span>
            </div>
          ))}
          {standings.length === 0 && (
            <div className="py-12 text-center text-[var(--muted)] text-sm">경기 데이터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
