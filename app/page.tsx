'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MatchEvent, LeagueData } from '@/types';
import { fmtDate, ko } from '@/lib/football';
import { getCurrentSeason, getAvailableSeasons, isPastSeason } from '@/lib/season';
import ScheduleTab from '@/components/ScheduleTab';
import MatchCard from '@/components/MatchCard';
import DetailPanel from '@/components/DetailPanel';
import Toast from '@/components/Toast';
import SkeletonCard from '@/components/SkeletonCard';
import Header from '@/components/Header';
import MyTeamModal from '@/components/MyTeamModal';
import StandingsModal from '@/components/StandingsModal';
import { useMyTeam } from '@/hooks/useMyTeam';

// ── 상수 ──────────────────────────────────────────────────
const SESSION_KEY_PREFIX = 'league_v3_';
const CACHE_TTL = 2 * 60 * 1000; // 2분 (DB가 실제 캐시이므로 짧게)
const MAX_ROUNDS = 40;
const DAILY_SYNC_KEY_PREFIX = 'kl_sync_';

// 시즌 종류별 배치 전략
// dbHit=true: DB에 데이터 있음 → 배치당 API 호출 거의 없음 → delay 짧게
// dbHit=false: 첫 방문 → TheSportsDB 직접 호출 → rate limit 준수
const BATCH_CONFIG = {
  current:       { size: 3, delayMs: 7000, emptyDelayMs: 400 },
  current_dbhit: { size: 5, delayMs: 2000, emptyDelayMs: 100 }, // DB 히트: 빠른 sync
  past:          { size: 2, delayMs: 3000, emptyDelayMs: 200 }, // 2→ 4.2s 서버 + 3s delay
  past_dbhit:    { size: 8, delayMs: 1000, emptyDelayMs: 100 }, // DB 히트: 빠르게 유지
} as const;

// ── 유틸 ──────────────────────────────────────────────────
function cacheKey(league: string, season: string) {
  return `${SESSION_KEY_PREFIX}${league}_${season}`;
}

function getCached(league: string, season: string): LeagueData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(league, season));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as LeagueData;
  } catch { return null; }
}

function setCache(league: string, season: string, data: LeagueData) {
  try {
    sessionStorage.setItem(cacheKey(league, season), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function dataKey(league: string, season: string) { return `${league}_${season}`; }
function toMonthKey(d: string) { return d.slice(0, 7); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── 일별 동기화 헬퍼 ─────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function isSyncedToday(league: string, season: string): boolean {
  try { return localStorage.getItem(`${DAILY_SYNC_KEY_PREFIX}${league}_${season}`) === todayStr(); }
  catch { return false; }
}
function markSyncedToday(league: string, season: string) {
  try { localStorage.setItem(`${DAILY_SYNC_KEY_PREFIX}${league}_${season}`, todayStr()); }
  catch {}
}

function getMonths(events: MatchEvent[]): string[] {
  return Array.from(new Set(events.map((e) => toMonthKey(e.dateEvent)))).sort();
}

function groupByDate(events: MatchEvent[], month: string): Map<string, MatchEvent[]> {
  const map = new Map<string, MatchEvent[]>();
  events
    .filter((e) => toMonthKey(e.dateEvent) === month)
    .sort((a, b) =>
      a.dateEvent.localeCompare(b.dateEvent) || (a.strTime ?? '').localeCompare(b.strTime ?? '')
    )
    .forEach((e) => {
      if (!map.has(e.dateEvent)) map.set(e.dateEvent, []);
      map.get(e.dateEvent)!.push(e);
    });
  return map;
}

function todayMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMonthTitle(mk: string) {
  const [y, m] = mk.split('-');
  return `${y}년 ${parseInt(m)}월`;
}

// ── 컴포넌트 ───────────────────────────────────────────────
export default function Home() {
  const SEASONS = useMemo(() => getAvailableSeasons(), []);
  const [activeLeague, setActiveLeague] = useState<'k1' | 'k2'>('k1');
  const [activeSeason, setActiveSeason] = useState<string>(getCurrentSeason);
  const [leagueData, setLeagueData] = useState<Record<string, LeagueData | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MatchEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bgStatus, setBgStatus] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [myTeamModalOpen, setMyTeamModalOpen] = useState(false);
  const [myTeamFilterActive, setMyTeamFilterActive] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const { myTeam, myTeamLeague, setMyTeam } = useMyTeam();

  const bgRunning = useRef<Record<string, boolean>>({});

  // ── 배경 라운드 배치 로딩 ──────────────────────────────
  const fetchAllRounds = useCallback(
    async (league: string, season: string, seenIds: Set<string>, dbHit: boolean, maxRound = MAX_ROUNDS) => {
      const dk = dataKey(league, season);
      if (bgRunning.current[dk]) return;
      bgRunning.current[dk] = true;

      // 실제 최대 라운드 기준으로 루프 (최소 38, 최대 MAX_ROUNDS)
      const totalRounds = Math.min(Math.max(maxRound, 38), MAX_ROUNDS);

      const past = isPastSeason(season);
      const cfgKey = past
        ? (dbHit ? 'past_dbhit' : 'past')
        : (dbHit ? 'current_dbhit' : 'current');
      const cfg = BATCH_CONFIG[cfgKey];

      let successCount = 0;
      try {
        for (let r = 1; r <= totalRounds; r += cfg.size) {
          const batch = Array.from(
            { length: Math.min(cfg.size, totalRounds - r + 1) },
            (_, i) => r + i
          );
          setBgStatus(dk);

          // 429 재시도 (최대 2회, 초과 시 배치 스킵)
          let retries = 0;
          let res: Response | null = null;
          while (retries <= 2) {
            res = await fetch(
              `/api/league/${league}/rounds?r=${batch.join(',')}&season=${season}`
            );
            if (res.status !== 429) break;
            retries++;
            if (retries > 2) { res = null; break; }
            setBgStatus('잠시 대기 중...');
            await sleep(15000 * retries); // 15s → 30s 백오프
          }

          if (!res || res.status === 429 || !res.ok) {
            await sleep(cfg.emptyDelayMs);
            continue;
          }

          successCount++;
          const data: { events: MatchEvent[]; fetchedFromApi?: number } = await res.json();
          const newEvents = (data.events ?? []).filter((e) => !seenIds.has(e.idEvent));
          // API 호출이 없었으면(DB 히트만) delay 최소화
          if ((data.fetchedFromApi ?? 0) === 0 && newEvents.length === 0) {
            await sleep(cfg.emptyDelayMs);
            continue;
          }

          if (newEvents.length > 0) {
            newEvents.forEach((e) => seenIds.add(e.idEvent));

            setLeagueData((prev) => {
              const existing = prev[dk];
              if (!existing) return prev;
              const merged = [...existing.events, ...newEvents]
                .filter((e, i, arr) => arr.findIndex((x) => x.idEvent === e.idEvent) === i)
                .sort((a, b) => a.dateEvent.localeCompare(b.dateEvent));
              const updated: LeagueData = { ...existing, events: merged };
              setCache(league, season, updated);
              return { ...prev, [dk]: updated };
            });

            await sleep(cfg.delayMs);
          } else {
            await sleep(cfg.emptyDelayMs);
          }
        }
      } finally {
        bgRunning.current[dk] = false;
        setBgStatus(null);
        if (successCount > 0) markSyncedToday(league, season);
        setLeagueData((prev) => {
          const existing = prev[dk];
          if (!existing) return prev;
          const updated = { ...existing, _bgDone: true };
          setCache(league, season, updated);
          return { ...prev, [dk]: updated };
        });
      }
    },
    []
  );

  // ── 초기 리그 데이터 로드 ─────────────────────────────
  const loadLeague = useCallback(
    async (league: string, season: string) => {
      const dk = dataKey(league, season);
      setError(null);
      if (leagueData[dk]) return;

      const cached = getCached(league, season);
      if (cached) {
        setLeagueData((prev) => ({ ...prev, [dk]: cached }));
        if (!cached._bgDone) {
          if (isSyncedToday(league, season)) {
            // 오늘 이미 동기화됨 → 바로 완료 처리
            setLeagueData((prev) => {
              const existing = prev[dk];
              if (!existing) return prev;
              const updated = { ...existing, _bgDone: true };
              setCache(league, season, updated);
              return { ...prev, [dk]: updated };
            });
          } else {
            fetchAllRounds(league, season, new Set(cached.events.map((e) => e.idEvent)), true, cached._maxRound);
          }
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/league/${league}?season=${season}`);
        if (!res.ok) throw new Error(`API 오류 (${res.status})`);
        const data: LeagueData & { _dbHit?: boolean } = await res.json();
        const dbHit = data._dbHit ?? false;

        if (dbHit && isSyncedToday(league, season)) {
          // DB에 데이터 있고 오늘 이미 동기화됨 → 직접 완료 처리
          const updated = { ...data, _bgDone: true };
          setCache(league, season, updated);
          setLeagueData((prev) => ({ ...prev, [dk]: updated }));
        } else {
          setCache(league, season, data);
          setLeagueData((prev) => ({ ...prev, [dk]: data }));
          const seenIds = new Set(data.events.map((e: MatchEvent) => e.idEvent));
          fetchAllRounds(league, season, seenIds, dbHit, data._maxRound);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [leagueData, fetchAllRounds]
  );

  // 마운트: 현재 시즌 K1 로드
  useEffect(() => { loadLeague('k1', getCurrentSeason()); }, []); // eslint-disable-line

  // 초기 로드 완료 후 배경 배치 로딩 시작
  const currentDK = dataKey(activeLeague, activeSeason);
  const currentData = leagueData[currentDK] ?? null;

  useEffect(() => {
    if (!currentData || currentData._bgDone) return;
    if (isSyncedToday(activeLeague, activeSeason)) {
      // 오늘 이미 동기화됨 → 즉시 완료 처리
      const dk = dataKey(activeLeague, activeSeason);
      setLeagueData((prev) => {
        const existing = prev[dk];
        if (!existing) return prev;
        const updated = { ...existing, _bgDone: true };
        setCache(activeLeague, activeSeason, updated);
        return { ...prev, [dk]: updated };
      });
      return;
    }
    fetchAllRounds(activeLeague, activeSeason, new Set(currentData.events.map((e) => e.idEvent)), false, currentData._maxRound);
  }, [currentData?._bgDone, activeLeague, activeSeason]); // eslint-disable-line

  // 탭·시즌 변경 핸들러
  const handleLeagueChange = (key: 'k1' | 'k2') => {
    setActiveLeague(key);
    setSelectedMonth(null);
    setSelectedDate(null);
    loadLeague(key, activeSeason);
    // 나의 팀 리그가 아닌 탭으로 이동하면 필터 해제
    if (myTeamFilterActive && myTeamLeague !== key) {
      setMyTeamFilterActive(false);
    }
  };

  const handleSeasonChange = (season: string) => {
    setActiveSeason(season);
    setSelectedMonth(null);
    setSelectedDate(null);
    loadLeague(activeLeague, season);
  };

  // 나의 팀 필터 토글: 비활성화 시 해당 리그로 전환
  const handleMyTeamFilterToggle = () => {
    if (!myTeamFilterActive && myTeam && myTeamLeague) {
      if (myTeamLeague !== activeLeague) {
        setActiveLeague(myTeamLeague);
        setSelectedMonth(null);
        setSelectedDate(null);
        loadLeague(myTeamLeague, activeSeason);
      }
      setMyTeamFilterActive(true);
    } else {
      setMyTeamFilterActive(false);
    }
  };

  // 이벤트·월 계산 (나의 팀 필터 적용)
  const allEvents = currentData?.events ?? [];
  const events = useMemo(() => {
    if (myTeamFilterActive && myTeam) {
      return allEvents.filter(
        (e) => ko(e.strHomeTeam) === myTeam || ko(e.strAwayTeam) === myTeam
      );
    }
    return allEvents;
  }, [allEvents, myTeamFilterActive, myTeam]);
  const teamsByName = currentData?.teamsByName ?? {};
  const myTeamEntry = useMemo(() => {
    if (!myTeam) return null;
    const entry = Object.entries(teamsByName).find(([name]) => ko(name) === myTeam);
    return entry?.[1] ?? null;
  }, [myTeam, teamsByName]);
  const months = useMemo(() => getMonths(events), [events]);

  // 오늘 달(또는 첫 달) 자동 선택
  useEffect(() => {
    if (months.length === 0) return;
    setSelectedMonth((prev) => {
      if (prev && months.includes(prev)) return prev;
      // 현재 시즌: 오늘 달 우선, 과거 시즌: 마지막 달
      if (isPastSeason(activeSeason)) return months[months.length - 1];
      const today = todayMonthKey();
      return months.includes(today) ? today : months[0];
    });
  }, [months, activeSeason]);

  const activeMonth = selectedMonth ?? months[0] ?? null;
  const dateGroups = useMemo(
    () => (activeMonth ? groupByDate(events, activeMonth) : new Map()),
    [events, activeMonth]
  );

  // 월/이벤트 변경 시 날짜 자동 선택
  useEffect(() => {
    const dates = Array.from(dateGroups.keys());
    if (dates.length === 0) return;
    setSelectedDate((prev) => {
      if (prev && dateGroups.has(prev)) return prev;
      const today = new Date().toISOString().slice(0, 10);
      if (dateGroups.has(today)) return today;
      // 오늘 이후 가장 가까운 날짜, 없으면 가장 최근 날짜
      const upcoming = dates.filter((d) => d >= today);
      return upcoming.length > 0 ? upcoming[0] : dates[dates.length - 1];
    });
  }, [dateGroups]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-black/35 backdrop-blur-md border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-0">
          <Header
            myTeam={myTeam}
            myTeamFilterActive={myTeamFilterActive}
            onMyTeamFilterToggle={handleMyTeamFilterToggle}
            onMyTeamEdit={() => setMyTeamModalOpen(true)}
            myTeamBadge={myTeamEntry?.badge ?? null}
            myTeamFallbackBadge={myTeamEntry?.fallbackBadge ?? null}
          />
        </div>

        {/* 리그 탭 + 순위표 버튼 */}
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <ScheduleTab activeLeague={activeLeague} onChange={handleLeagueChange} />
          </div>
          <button
            onClick={() => setStandingsOpen(true)}
            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors"
          >
            순위표
          </button>
        </div>

        {/* 시즌 선택 */}
        <div className="max-w-3xl mx-auto px-4 pt-2 pb-1 flex items-center gap-2">
          <span className="text-[10px] text-[var(--muted)] shrink-0">시즌</span>
          <div className="flex gap-1">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSeasonChange(s)}
                className={[
                  'px-3 py-0.5 rounded-full text-xs font-bold transition-colors border',
                  activeSeason === s
                    ? 'bg-[#3ea6ff]/20 border-[#3ea6ff] text-[#3ea6ff]'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[#3ea6ff]/50 hover:text-[var(--text)]',
                ].join(' ')}
              >
                {s}
              </button>
            ))}
          </div>
          {isPastSeason(activeSeason) && (
            <span className="text-[10px] text-[#f5b301] ml-1">이전 시즌</span>
          )}
        </div>

        {/* 월 내비게이션 */}
        {months.length > 0 && activeMonth && (
          <>
            <div className="max-w-3xl mx-auto px-4 flex items-center justify-between py-2">
              <button
                onClick={() => {
                  const idx = months.indexOf(activeMonth);
                  if (idx > 0) { setSelectedMonth(months[idx - 1]); setSelectedDate(null); }
                }}
                disabled={months.indexOf(activeMonth) <= 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text)] text-xl font-bold disabled:opacity-30 hover:bg-[var(--panel2)] transition-colors"
                aria-label="이전 달"
              >
                ‹
              </button>
              <span className="text-sm font-bold text-[var(--text)]">
                {fmtMonthTitle(activeMonth)}
              </span>
              <button
                onClick={() => {
                  const idx = months.indexOf(activeMonth);
                  if (idx < months.length - 1) { setSelectedMonth(months[idx + 1]); setSelectedDate(null); }
                }}
                disabled={months.indexOf(activeMonth) >= months.length - 1}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text)] text-xl font-bold disabled:opacity-30 hover:bg-[var(--panel2)] transition-colors"
                aria-label="다음 달"
              >
                ›
              </button>
            </div>

            {/* 날짜 칩 */}
            <div className="max-w-3xl mx-auto px-4 date-chip-bar">
              <div className="flex gap-2 pb-3">
                {(() => {
                  const today = todayISO();
                  return Array.from(dateGroups.keys()).map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={[
                        'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap',
                        selectedDate === d
                          ? 'bg-[var(--accent)] text-white'
                          : d === today
                          ? 'text-[var(--text)] font-bold ring-1 ring-[var(--accent)]/50'
                          : 'text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]',
                      ].join(' ')}
                    >
                      {fmtDate(d)}
                    </button>
                  ));
                })()}
              </div>
            </div>
          </>
        )}
      </header>

      {/* 메인 */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-4">
        <p className="sm:hidden text-[10px] text-[var(--muted)] mb-3">
          TheSportsDB 무료 데이터 · AI 예측은 참고용
        </p>

        {loading && <SkeletonCard />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="text-[var(--muted)] text-sm">{error}</p>
            <button
              onClick={() => {
                setLeagueData((prev) => ({ ...prev, [currentDK]: null }));
                loadLeague(activeLeague, activeSeason);
              }}
              className="px-4 py-2 rounded-lg bg-[#3ea6ff] text-white text-sm font-semibold hover:bg-[#2d8fdf] transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 라운드 로딩 중: 현재 탭 dk와 일치할 때만 스피너 표시 */}
        {!loading && !error && bgStatus === currentDK && (
          <div className="flex flex-col items-center justify-center gap-4 py-32">
            <span className="inline-block w-10 h-10 border-4 border-[#3ea6ff] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--muted)]">경기 일정을 불러오고 있습니다.</p>
          </div>
        )}

        {/* 로딩 완료: 일정 표시 */}
        {!loading && !error && bgStatus !== currentDK && (
          <>
            {/* 나의 팀 전적 요약 */}
            {myTeamFilterActive && myTeam && (() => {
              let wins = 0, draws = 0, losses = 0;
              for (const e of events) {
                if (e.intHomeScore == null || e.intAwayScore == null || e.intHomeScore === '' || e.intAwayScore === '') continue;
                const hs = parseInt(e.intHomeScore), as_ = parseInt(e.intAwayScore);
                const isHome = ko(e.strHomeTeam) === myTeam;
                const isAway = ko(e.strAwayTeam) === myTeam;
                if (!isHome && !isAway) continue;
                if ((isHome && hs > as_) || (isAway && as_ > hs)) wins++;
                else if (hs === as_) draws++;
                else losses++;
              }
              const played = wins + draws + losses;
              const points = wins * 3 + draws;
              return played > 0 ? (
                <div className="mb-3 px-3 py-2 rounded-xl bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#3ea6ff]">{myTeam} 시즌 전적</span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {played}경기 <span className="text-[var(--win)] font-bold">{wins}승</span> {draws}무 {losses}패 · {points}점
                  </span>
                </div>
              ) : null;
            })()}
            {dateGroups.size === 0 ? (
              <div className="py-16 text-center text-[var(--muted)] text-sm">
                {currentData ? '이 달에 경기가 없습니다.' : '데이터를 불러오는 중...'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(selectedDate ? dateGroups.get(selectedDate) ?? [] : []).map((event: MatchEvent) => (
                  <MatchCard
                    key={event.idEvent}
                    event={event}
                    teamsByName={teamsByName}
                    onClick={() => setSelectedEvent(event)}
                    myTeam={myTeam}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {selectedEvent && currentData && (
        <DetailPanel
          event={selectedEvent}
          leagueKey={activeLeague}
          allEvents={events}
          teamsByName={teamsByName}
          onClose={() => setSelectedEvent(null)}
          onQuotaExceeded={() =>
            setToast('AI 분석 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.')
          }
          myTeam={myTeam}
          onMyTeamSet={(teamKo, league) => {
            setMyTeam(teamKo, league);
            if (!teamKo) setMyTeamFilterActive(false);
          }}
        />
      )}

      {myTeamModalOpen && (
        <MyTeamModal
          allEvents={allEvents}
          teamsByName={teamsByName}
          currentTeam={myTeam}
          currentLeague={activeLeague}
          onSelect={(teamKo, league) => {
            setMyTeam(teamKo, league);
            // 해당 팀의 리그로 이동
            if (league !== activeLeague) {
              setActiveLeague(league);
              setSelectedMonth(null);
              loadLeague(league, activeSeason);
            }
            setMyTeamFilterActive(true);
          }}
          onRemove={() => {
            setMyTeam(null);
            setMyTeamFilterActive(false);
          }}
          onClose={() => setMyTeamModalOpen(false)}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />

      {standingsOpen && currentData && (
        <StandingsModal
          allEvents={allEvents}
          teamsByName={teamsByName}
          leagueKey={activeLeague}
          onClose={() => setStandingsOpen(false)}
        />
      )}
    </div>
  );
}
