'use client';

import BadgeImg from '@/components/BadgeImg';

interface HeaderProps {
  myTeam: string | null;
  myTeamFilterActive: boolean;
  onMyTeamFilterToggle: () => void;
  onMyTeamEdit: () => void;
  myTeamBadge?: string | null;
  myTeamFallbackBadge?: string | null;
}

export default function Header({
  myTeam,
  myTeamFilterActive,
  onMyTeamFilterToggle,
  onMyTeamEdit,
  myTeamBadge,
  myTeamFallbackBadge,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h1 className="text-xl font-black tracking-tight">K리그 ⚽</h1>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--muted)] hidden sm:block">
          TheSportsDB 무료 데이터 · AI 예측은 참고용
        </span>

        {/* 나의 팀 */}
        {myTeam ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onMyTeamFilterToggle}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
                myTeamFilterActive
                  ? 'bg-[#3ea6ff]/20 border-[#3ea6ff] text-[#3ea6ff]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[#3ea6ff]/50 hover:text-[#3ea6ff]',
              ].join(' ')}
              aria-label={myTeamFilterActive ? '전체 경기 보기' : '나의 팀 경기만 보기'}
              aria-pressed={myTeamFilterActive}
            >
              <BadgeImg badge={myTeamBadge} fallbackBadge={myTeamFallbackBadge} label={myTeam ?? ''} size={18} />
              {myTeam}
            </button>
            <button
              onClick={onMyTeamEdit}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-white hover:bg-white/10 text-[11px] transition-colors"
              aria-label="나의 팀 변경"
            >
              ✎
            </button>
          </div>
        ) : (
          <button
            onClick={onMyTeamEdit}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-[var(--border)] text-[var(--muted)] hover:border-[#3ea6ff]/50 hover:text-[#3ea6ff] transition-colors"
            aria-label="나의 팀 등록"
          >
            ⚽ 나의 팀
          </button>
        )}
      </div>
    </div>
  );
}
