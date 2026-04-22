export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getBadgeUrl } from '@/lib/badges';
import { getCurrentSeason } from '@/lib/season';
import { getEventsFromDb, upsertEvents } from '@/lib/matchDb';
import type { MatchEvent, TeamData } from '@/types';

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

const LEAGUE_CONFIG: Record<string, { id: string; name: string }> = {
  k1: { id: '4689', name: 'South Korean K League 1' },
  k2: { id: '4822', name: 'South Korean K League 2' },
};

const K1_TEAMS = new Set([
  'FC Seoul','Jeju United','Jeju SK','Jeju United FC','Jeonbuk Hyundai Motors',
  'Ulsan HD FC','Ulsan HD','Ulsan Hyundai FC','Pohang Steelers',
  'Gimcheon Sangmu FC','Gimcheon Sangmu','Sangju Sangmu',
  'Gwangju FC','Incheon United','Incheon United FC','Gangwon FC',
  'Daejeon Citizen','Daejeon Hana Citizen','Daegu FC','Suwon FC',
  'FC Anyang','Bucheon FC 1995','Suwon Samsung Bluewings',
]);

interface SportsDBEvent {
  idEvent: string; dateEvent: string; strTime?: string | null;
  strHomeTeam: string; strAwayTeam: string;
  intHomeScore?: string | null; intAwayScore?: string | null;
  strVenue?: string | null; intRound?: string | null;
}
interface SportsDBTeam {
  strTeam: string; idTeam?: string; strTeamBadge?: string | null;
}
interface SportsDBTableEntry {
  strTeam: string; intRank?: string | null; intPlayed?: string | null;
  intWin?: string | null; intDraw?: string | null; intLoss?: string | null;
  intGoalsFor?: string | null; intGoalsAgainst?: string | null;
  intGoalDifference?: string | null; intPoints?: string | null;
}

async function fetchTeamsAndTable(config: { id: string; name: string }, season: string) {
  const safeJson = async <T>(res: Response, fallback: T): Promise<T> => {
    if (!res.ok) return fallback;
    try { return await res.json(); } catch { return fallback; }
  };
  const [tableRes, teamsRes] = await Promise.all([
    fetch(`${SPORTSDB_BASE}/lookuptable.php?l=${config.id}&s=${season}`, { next: { revalidate: 300 } }),
    fetch(`${SPORTSDB_BASE}/search_all_teams.php?l=${encodeURIComponent(config.name)}`, { next: { revalidate: 3600 } }),
  ]);
  const tableJson = await safeJson(tableRes, { table: [] });
  const teamsJson = await safeJson(teamsRes, { teams: [] });
  return {
    rawTable: (tableJson?.table ?? []) as SportsDBTableEntry[],
    rawTeams: (teamsJson?.teams ?? []) as SportsDBTeam[],
  };
}

// 과거 시즌 팀명 별칭 (현재명 → 과거명들)
const TEAM_ALIASES: Record<string, string[]> = {
  'FC Anyang':           ['Anyang'],
  'Gimpo FC':            ['Gimpo Citizen'],
  'Gimcheon Sangmu FC':  ['Sangju Sangmu', 'Gimcheon Sangmu'],
  'Ulsan HD FC':         ['Ulsan HD', 'Ulsan Hyundai FC'],
  'Incheon United':      ['Incheon United FC'],
  'Jeju United':         ['Jeju SK', 'Jeju United FC'],
  'Daejeon Hana Citizen':['Daejeon Citizen'],
  'Chungnam Asan FC':    ['Chungnam Asan'],
  'Seoul E-Land FC':     ['Seoul E-Land'],
  'Chungbuk Cheongju FC':['Chungbuk Cheongju'],
};

function buildTeamsByName(
  rawTeams: SportsDBTeam[],
  rawTable: SportsDBTableEntry[],
  key: string,
  supabaseUrl: string
): Record<string, TeamData> {
  const teamsByName: Record<string, TeamData> = {};
  for (const t of rawTeams) {
    teamsByName[t.strTeam] = { name: t.strTeam, id: t.idTeam, badge: getBadgeUrl(t.strTeam, supabaseUrl) };
  }
  // 과거 시즌 별칭 추가 (현재 팀명으로 badge/stats 상속)
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const source = teamsByName[canonical];
    for (const alias of aliases) {
      if (!teamsByName[alias]) {
        const badge = getBadgeUrl(alias, supabaseUrl) ?? source?.badge ?? null;
        teamsByName[alias] = { ...(source ?? {}), name: alias, badge };
      }
    }
  }
  // FC-suffix 양방향 별칭
  for (const name of Object.keys(teamsByName)) {
    if (name.endsWith(' FC')) {
      const base = name.slice(0, -3);
      if (!teamsByName[base]) teamsByName[base] = { ...teamsByName[name], name: base };
    } else {
      const fc = `${name} FC`;
      if (!teamsByName[fc]) teamsByName[fc] = { ...teamsByName[name], name: fc };
    }
  }
  // 순위표 덮어쓰기
  for (const row of rawTable) {
    const n = row.strTeam;
    if (key === 'k1' && !K1_TEAMS.has(n)) continue;
    if (!teamsByName[n]) teamsByName[n] = { name: n, badge: getBadgeUrl(n, supabaseUrl) };
    const entry = teamsByName[n];
    Object.assign(entry, {
      rank:         row.intRank        ? parseInt(row.intRank)         : null,
      played:       row.intPlayed      ? parseInt(row.intPlayed)       : null,
      win:          row.intWin         ? parseInt(row.intWin)          : null,
      draw:         row.intDraw        ? parseInt(row.intDraw)         : null,
      loss:         row.intLoss        ? parseInt(row.intLoss)         : null,
      goalsFor:     row.intGoalsFor    ? parseInt(row.intGoalsFor)     : null,
      goalsAgainst: row.intGoalsAgainst? parseInt(row.intGoalsAgainst) : null,
      goalDiff:     row.intGoalDifference ? parseInt(row.intGoalDifference) : null,
      points:       row.intPoints      ? parseInt(row.intPoints)       : null,
    });
    // FC 별칭에도 동기화
    if (n.endsWith(' FC') && teamsByName[n.slice(0,-3)])
      Object.assign(teamsByName[n.slice(0,-3)], { ...entry, name: n.slice(0,-3) });
    else if (!n.endsWith(' FC') && teamsByName[`${n} FC`])
      Object.assign(teamsByName[`${n} FC`], { ...entry, name: `${n} FC` });
  }
  return teamsByName;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const config = LEAGUE_CONFIG[key];
  if (!config) return NextResponse.json({ error: 'Invalid league key' }, { status: 400 });

  const season = request.nextUrl.searchParams.get('season') ?? getCurrentSeason();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  try {
    // ── 1. DB에서 이벤트 조회 (빠름) ─────────────────────────
    let events: MatchEvent[] = [];
    let dbHit = false;
    try {
      events = await getEventsFromDb(key, season);
      dbHit = events.length > 0;
    } catch (dbErr) {
      console.warn('[league] DB read failed, falling back to API:', dbErr);
    }

    // ── 2. DB가 비어있으면 TheSportsDB에서 초기 15경기 가져와 저장 ──
    if (!dbHit) {
      const seedRes = await fetch(
        `${SPORTSDB_BASE}/eventsseason.php?id=${config.id}&s=${season}`,
        { next: { revalidate: 300 } }
      );
      if (seedRes.status === 429) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      if (seedRes.ok) {
        const json = await seedRes.json();
        const raw: SportsDBEvent[] = json?.events ?? [];
        events = raw.map((e) => ({
          idEvent: e.idEvent, dateEvent: e.dateEvent, strTime: e.strTime ?? null,
          strHomeTeam: e.strHomeTeam, strAwayTeam: e.strAwayTeam,
          intHomeScore: e.intHomeScore ?? null, intAwayScore: e.intAwayScore ?? null,
          strVenue: e.strVenue ?? null, intRound: e.intRound ?? null,
        }));
        // 비동기로 DB에 저장 (응답을 막지 않음)
        upsertEvents(events, key, season).catch((e) => console.error('[league] upsert error:', e));
      }
    }

    // ── 3. 팀·순위표 (서버 캐시 활용, 빠름) ─────────────────
    const { rawTeams, rawTable } = await fetchTeamsAndTable(config, season);
    const teamsByName = buildTeamsByName(rawTeams, rawTable, key, supabaseUrl);

    const maxRound = events.reduce((m, e) => Math.max(m, parseInt(e.intRound ?? '0') || 0), 0);

    const response = NextResponse.json({
      events,
      teamsByName,
      _maxRound: maxRound,
      _bgDone: false,
      _dbHit: dbHit, // 클라이언트가 DB 히트 여부 알 수 있음
    });
    response.headers.set('Cache-Control', 'no-store'); // 항상 최신 DB 데이터
    return response;
  } catch (err) {
    console.error('[/api/league] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 502 });
  }
}
