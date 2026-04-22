export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSeason } from '@/lib/season';
import { getEventsByRoundsFromDb, upsertEvents, updateScores } from '@/lib/matchDb';
import type { MatchEvent } from '@/types';

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const LEAGUE_IDS: Record<string, string> = { k1: '4689', k2: '4822' };

interface RawEvent {
  idEvent: string; dateEvent: string; strTime?: string | null;
  strHomeTeam: string; strAwayTeam: string;
  intHomeScore?: string | null; intAwayScore?: string | null;
  strVenue?: string | null; intRound?: string | null;
}

function toMatchEvent(e: RawEvent): MatchEvent {
  return {
    idEvent: e.idEvent, dateEvent: e.dateEvent, strTime: e.strTime ?? null,
    strHomeTeam: e.strHomeTeam, strAwayTeam: e.strAwayTeam,
    intHomeScore: e.intHomeScore ?? null, intAwayScore: e.intAwayScore ?? null,
    strVenue: e.strVenue ?? null, intRound: e.intRound ?? null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const leagueId = LEAGUE_IDS[key];
  if (!leagueId) return NextResponse.json({ error: 'Invalid key' }, { status: 400 });

  const season = request.nextUrl.searchParams.get('season') ?? getCurrentSeason();
  const roundsParam = request.nextUrl.searchParams.get('r') ?? '';
  const rounds = roundsParam.split(',').map(Number).filter((n) => n >= 1 && n <= 40);
  if (rounds.length === 0) return NextResponse.json({ events: [] });

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. DB에서 해당 라운드 이벤트 조회 ─────────────────────
  let dbEvents: MatchEvent[] = [];
  let roundsInDb = new Set<number>();
  let staleRounds = new Set<number>();
  try {
    ({ events: dbEvents, roundsInDb, staleRounds } = await getEventsByRoundsFromDb(key, season, rounds));
  } catch (e) {
    console.warn('[rounds] DB read failed:', e);
  }

  // ── 2. 스마트 판별: 어느 라운드를 API에서 새로 가져올지 ──────
  //   • DB에 없는 라운드 → 무조건 fetch
  //   • DB에 있어도 "결과 미입력 + 날짜 지남" 경기 존재 → re-fetch
  const pendingRoundSet = new Set(
    dbEvents
      .filter((e) => e.dateEvent <= today && !e.intHomeScore && e.intRound)
      .map((e) => parseInt(e.intRound!))
  );

  const roundsToFetch = rounds.filter(
    (r) => !roundsInDb.has(r) || pendingRoundSet.has(r) || staleRounds.has(r)
  );

  // ── 3. 필요한 라운드만 TheSportsDB에서 fetch ───────────────
  let newEvents: MatchEvent[] = [];
  if (roundsToFetch.length > 0) {
    // 순차 요청 + 2100ms 간격 → 30 req/min 이하 유지
    const results: Array<{ events?: RawEvent[] | null } | { rateLimited: boolean }> = [];
    for (let i = 0; i < roundsToFetch.length; i++) {
      const r = roundsToFetch[i];
      const result = await fetch(
        `${SPORTSDB_BASE}/eventsround.php?id=${leagueId}&r=${r}&s=${season}`,
        { next: { revalidate: 0 } }
      )
        .then((res) => {
          if (res.status === 429) return { rateLimited: true };
          return res.ok ? res.json() : { events: null };
        })
        .catch(() => ({ events: null }));

      results.push(result);

      if ('rateLimited' in result && result.rateLimited) {
        // 429 발생: 지금까지 받은 DB 데이터 반환
        return NextResponse.json(
          { events: dbEvents, error: 'rate_limit' },
          { status: 429 }
        );
      }

      // 마지막 라운드가 아니면 2100ms 대기 (30 req/min 준수)
      if (i < roundsToFetch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }

    newEvents = results
      .flatMap((d) => (d as { events?: RawEvent[] | null })?.events ?? [])
      .map(toMatchEvent);

    // ── 4. 변경된 것만 DB에 upsert ──────────────────────────
    if (newEvents.length > 0) {
      // 새로운 이벤트 (DB에 없던 것) → upsert
      const existingIds = new Set(dbEvents.map((e) => e.idEvent));
      const brandNew = newEvents.filter((e) => !existingIds.has(e.idEvent));
      if (brandNew.length > 0) {
        upsertEvents(brandNew, key, season).catch((e) => console.error('[rounds] upsert error:', e));
      }
      // 스코어 업데이트 (pending이었다가 결과 나온 경기)
      const scoreUpdates = newEvents.filter(
        (e) => pendingRoundSet.has(parseInt(e.intRound ?? '0')) && e.intHomeScore
      );
      if (scoreUpdates.length > 0) {
        updateScores(scoreUpdates).catch((e) => console.error('[rounds] score update error:', e));
      }
      // 일정 변경 감지: stale 라운드의 이벤트를 전체 upsert (날짜/시간/장소 변경 반영)
      const staleUpdates = newEvents.filter(
        (e) => staleRounds.has(parseInt(e.intRound ?? '0'))
      );
      if (staleUpdates.length > 0) {
        upsertEvents(staleUpdates, key, season).catch((e) => console.error('[rounds] stale upsert error:', e));
      }
    }
  }

  // ── 5. DB 이벤트 + 새 이벤트 병합 후 반환 ─────────────────
  const allEvents = [...dbEvents, ...newEvents]
    .filter((e, i, arr) => arr.findIndex((x) => x.idEvent === e.idEvent) === i);

  // 어느 라운드를 API에서 실제로 가져왔는지 알려줌 (클라이언트 배치 조율용)
  return NextResponse.json({
    events: allEvents,
    fetchedFromApi: roundsToFetch.length,
  });
}
