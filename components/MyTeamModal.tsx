'use client';

import { useState, useEffect, useMemo } from 'react';
import { MatchEvent, TeamData } from '@/types';
import { ko } from '@/lib/football';

interface MyTeamModalProps {
  allEvents: MatchEvent[];
  teamsByName: Record<string, TeamData>;
  currentTeam: string | null;
  currentLeague: 'k1' | 'k2';
  onSelect: (teamKo: string, league: 'k1' | 'k2') => void;
  onRemove: () => void;
  onClose: () => void;
}

function TeamBadge({ badge, fallbackBadge, name, size = 36 }: { badge?: string | null; fallbackBadge?: string | null; name: string; size?: number }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? badge : stage === 1 ? fallbackBadge : null;
  if (!src) {
    return (
      <span
        className="team-badge-fallback text-[10px] font-bold shrink-0"
        style={{ width: size, height: size, minWidth: size }}
      >
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', minWidth: size }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}

export default function MyTeamModal({
  allEvents,
  teamsByName,
  currentTeam,
  currentLeague,
  onSelect,
  onRemove,
  onClose,
}: MyTeamModalProps) {
  const [query, setQuery] = useState('');

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // 전체 팀 목록 (영문명 → 중복 제거 → 한글명 정렬)
  const allTeams = useMemo(() => {
    const seen = new Set<string>();
    const list: { engName: string; koName: string; data: TeamData | undefined }[] = [];
    for (const e of allEvents) {
      for (const engName of [e.strHomeTeam, e.strAwayTeam]) {
        const koName = ko(engName);
        if (!seen.has(koName)) {
          seen.add(koName);
          list.push({ engName, koName, data: teamsByName[engName] });
        }
      }
    }
    return list.sort((a, b) => a.koName.localeCompare(b.koName, 'ko'));
  }, [allEvents, teamsByName]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allTeams;
    return allTeams.filter((t) => t.koName.includes(q) || t.engName.toLowerCase().includes(q.toLowerCase()));
  }, [allTeams, query]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-[var(--panel)] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">나의 팀 등록</h2>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">구단을 선택하면 해당 팀 일정만 표시됩니다</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-[var(--muted)] hover:text-white text-lg"
          >
            ×
          </button>
        </div>

        {/* 현재 등록된 팀 */}
        {currentTeam && (
          <div className="px-4 py-2 bg-[#f5b301]/10 border-b border-[#f5b301]/20 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#f5b301] text-sm">★</span>
              <span className="text-sm font-bold text-[var(--text)]">현재: {currentTeam}</span>
            </div>
            <button
              onClick={onRemove}
              className="text-[11px] text-[var(--muted)] hover:text-[#ea3943] px-2 py-0.5 rounded border border-[var(--border)] hover:border-[#ea3943]/40 transition-colors"
            >
              등록 해제
            </button>
          </div>
        )}

        {/* 검색 */}
        <div className="px-4 py-2 shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="팀 검색..."
            className="w-full bg-[var(--panel2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            autoFocus
          />
        </div>

        {/* 팀 목록 */}
        <div className="overflow-y-auto flex-1 px-2 pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-8">검색 결과 없음</p>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map(({ engName, koName, data }) => {
                const isSelected = koName === currentTeam;
                return (
                  <button
                    key={koName}
                    onClick={() => { onSelect(koName, currentLeague); onClose(); }}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                      isSelected
                        ? 'bg-[#f5b301]/15 border border-[#f5b301]/40'
                        : 'hover:bg-[var(--panel2)] border border-transparent',
                    ].join(' ')}
                  >
                    <TeamBadge badge={data?.badge} fallbackBadge={data?.fallbackBadge} name={koName} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[var(--text)]">{koName}</div>
                      {data?.rank != null && (
                        <div className="text-[10px] text-[var(--muted)]">
                          {data.rank}위 · {data.points ?? '-'}점
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[#f5b301] text-base shrink-0">★</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
