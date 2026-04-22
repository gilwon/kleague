'use client';

import { useEffect, useState } from 'react';
import { MatchEvent, TeamData } from '@/types';
import { ko, h2h, strengths, predict, recentForm } from '@/lib/football';
import FootballPitch from './FootballPitch';
import AIPredictionBar from './AIPredictionBar';
import MatchReport from './MatchReport';

interface DetailPanelProps {
  event: MatchEvent;
  leagueKey: 'k1' | 'k2';
  allEvents: MatchEvent[];
  teamsByName: Record<string, TeamData>;
  onClose: () => void;
  onQuotaExceeded: () => void;
  myTeam?: string | null;
  onMyTeamSet?: (teamKo: string | null, league?: 'k1' | 'k2') => void;
}

export default function DetailPanel({
  event,
  leagueKey,
  allEvents,
  teamsByName,
  onClose,
  onQuotaExceeded,
  myTeam,
  onMyTeamSet,
}: DetailPanelProps) {
  // Design Ref: §5.3 — 통합 재분석 버튼, forceRefreshKey 변경 시 자식 컴포넌트 force=true 재요청
  const [forceRefreshKey, setForceRefreshKey] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);

  const handleReanalyze = () => {
    setReanalyzing(true);
    setForceRefreshKey((k) => k + 1);
    setTimeout(() => setReanalyzing(false), 2000);
  };

  const isPlayed =
    event.intHomeScore !== null &&
    event.intHomeScore !== undefined &&
    event.intHomeScore !== '';

  const homeData: TeamData & { name: string } = {
    ...(teamsByName[event.strHomeTeam] ?? {}),
    name: event.strHomeTeam,
  };
  const awayData: TeamData & { name: string } = {
    ...(teamsByName[event.strAwayTeam] ?? {}),
    name: event.strAwayTeam,
  };

  const h2hData = h2h(event.strHomeTeam, event.strAwayTeam, allEvents);
  const homeStrengths = strengths(event.strHomeTeam, teamsByName, allEvents);
  const awayStrengths = strengths(event.strAwayTeam, teamsByName, allEvents);
  const prediction = predict(event.strHomeTeam, event.strAwayTeam, teamsByName, allEvents);

  // 폼 문자열 (쿼리용)
  const hForm = recentForm(event.strHomeTeam, allEvents).join('');
  const aForm = recentForm(event.strAwayTeam, allEvents).join('');

  const queryParams: Record<string, string> = {
    type: isPlayed ? 'post' : 'pre',
    home: event.strHomeTeam,
    away: event.strAwayTeam,
    hForm,
    aForm,
    hPts: String(homeData.points ?? ''),
    aPts: String(awayData.points ?? ''),
    hRank: String(homeData.rank ?? ''),
    aRank: String(awayData.rank ?? ''),
    hScore: event.intHomeScore ?? '',
    aScore: event.intAwayScore ?? '',
    league: leagueKey,
  };

  // ESC 키 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    /* 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 패널 */}
      <div
        className="relative w-full sm:max-w-[860px] sm:mx-4 bg-[var(--panel)] rounded-t-2xl sm:rounded-2xl overflow-y-auto max-h-[95vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-[var(--muted)] hover:text-white text-xl leading-none"
          aria-label="닫기"
        >
          ×
        </button>

        {/* 1. 풋볼 피치 */}
        <FootballPitch
          homeTeam={homeData}
          awayTeam={awayData}
          event={event}
          allEvents={allEvents}
          myTeam={myTeam}
          onMyTeamSet={onMyTeamSet ? (teamKo) => onMyTeamSet(teamKo, leagueKey) : undefined}
        />

        {/* 본문 */}
        <div className="p-4 sm:p-6 flex flex-col gap-6">
          {/* 2. 상대전적 */}
          <section>
            <h2 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-1">
              상대 전적
            </h2>
            {h2hData.total > 0 && (
              <p className="text-[10px] text-[var(--muted)] mb-3">총 {h2hData.total}경기</p>
            )}
            {h2hData.total === 0 ? (
              <p className="text-sm text-[var(--muted)]">데이터 없음</p>
            ) : (
              <div className="flex items-end justify-center gap-8">
                <div className="flex items-end gap-1">
                  <span className="font-bold text-[#ff5a5f] text-xl leading-none">{h2hData.wa}</span>
                  <span className="text-xs text-[var(--muted)] pb-0.5">승</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-xl font-bold text-[#f5b301] leading-none">{h2hData.d}</span>
                  <span className="text-xs text-[var(--muted)] pb-0.5">무</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="font-bold text-[#3ea6ff] text-xl leading-none">{h2hData.wb}</span>
                  <span className="text-xs text-[var(--muted)] pb-0.5">승</span>
                </div>
              </div>
            )}
          </section>

          {/* 3. 팀별 특장점 */}
          <section>
            <h2 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">
              팀 특장점
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[var(--panel2)] rounded-xl p-3 border-l-2 border-[#ff5a5f]">
                <div className="text-xs font-bold text-[#ff5a5f] mb-1">{ko(event.strHomeTeam)}</div>
                <p className="text-sm text-[var(--text)] leading-relaxed">{homeStrengths || '분석 데이터 없음'}</p>
              </div>
              <div className="bg-[var(--panel2)] rounded-xl p-3 border-l-2 border-[#3ea6ff]">
                <div className="text-xs font-bold text-[#3ea6ff] mb-1">{ko(event.strAwayTeam)}</div>
                <p className="text-sm text-[var(--text)] leading-relaxed">{awayStrengths || '분석 데이터 없음'}</p>
              </div>
            </div>
          </section>

          {/* 4. AI 예측 바 */}
          <section>
            <h2 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3 flex items-center">
              승부 예측 &amp; AI 분석
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="ml-auto flex items-center gap-1 text-[11px] font-normal normal-case px-2 py-0.5 rounded bg-[var(--panel2)] text-[#3ea6ff] border border-[#3ea6ff]/30 hover:bg-[#3ea6ff]/10 disabled:opacity-40 transition-colors"
                aria-label="AI 분석 새로 고침"
              >
                <span className={reanalyzing ? 'inline-block animate-spin' : ''}>↻</span>
                새로 분석
              </button>
            </h2>
            <AIPredictionBar
              prediction={prediction}
              eventId={event.idEvent}
              isPlayed={isPlayed}
              queryParams={queryParams}
              onQuotaExceeded={onQuotaExceeded}
              forceRefreshKey={forceRefreshKey}
            />
          </section>

          {/* 5. 경기 리포트 (완료 경기만) */}
          {isPlayed && (
            <section>
              <h2 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">
                경기 리포트
                {/* <span className="ml-2 normal-case text-[#3ea6ff] font-normal">
                  유튜브·기사 기반
                </span> */}
              </h2>
              <div className="bg-[var(--panel2)] rounded-xl p-4">
                <MatchReport
                  eventId={event.idEvent}
                  homeKo={ko(event.strHomeTeam)}
                  awayKo={ko(event.strAwayTeam)}
                  homeScore={event.intHomeScore ?? ''}
                  awayScore={event.intAwayScore ?? ''}
                  date={event.dateEvent}
                  onQuotaExceeded={onQuotaExceeded}
                  forceRefreshKey={forceRefreshKey}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
