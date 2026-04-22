import { supabaseAnon, supabaseAdmin } from './supabase';
import type { MatchEvent } from '@/types';

interface DbRow {
  event_id: string;
  league_key: string;
  season: string;
  date_event: string;
  str_time: string | null;
  home_team: string;
  away_team: string;
  home_score: string | null;
  away_score: string | null;
  venue: string | null;
  round_num: string | null;
  synced_at: string;
}

function toMatchEvent(row: DbRow): MatchEvent {
  return {
    idEvent: row.event_id,
    dateEvent: row.date_event,
    strTime: row.str_time,
    strHomeTeam: row.home_team,
    strAwayTeam: row.away_team,
    intHomeScore: row.home_score,
    intAwayScore: row.away_score,
    strVenue: row.venue,
    intRound: row.round_num,
  };
}

function toDbRow(e: MatchEvent, league_key: string, season: string) {
  return {
    event_id:   e.idEvent,
    league_key,
    season,
    date_event: e.dateEvent,
    str_time:   e.strTime   ?? null,
    home_team:  e.strHomeTeam,
    away_team:  e.strAwayTeam,
    home_score: e.intHomeScore ?? null,
    away_score: e.intAwayScore ?? null,
    venue:      e.strVenue  ?? null,
    round_num:  e.intRound  ?? null,
    synced_at:  new Date().toISOString(),
  };
}

/** DB에서 해당 리그·시즌 전체 이벤트 조회 */
export async function getEventsFromDb(
  league_key: string,
  season: string
): Promise<MatchEvent[]> {
  const { data, error } = await supabaseAnon
    .from('match_events')
    .select('*')
    .eq('league_key', league_key)
    .eq('season', season)
    .order('date_event', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toMatchEvent);
}

/** 특정 라운드의 이벤트 DB 조회 */
export async function getEventsByRoundsFromDb(
  league_key: string,
  season: string,
  rounds: number[]
): Promise<{ events: MatchEvent[]; roundsInDb: Set<number>; staleRounds: Set<number> }> {
  const { data, error } = await supabaseAnon
    .from('match_events')
    .select('*')
    .eq('league_key', league_key)
    .eq('season', season)
    .in('round_num', rounds.map(String));

  if (error) throw error;
  const rows = data ?? [];
  const events = rows.map(toMatchEvent);
  const roundsInDb = new Set(
    rows.map((r) => parseInt(r.round_num ?? '0')).filter(Boolean)
  );

  const STALE_TTL_MS = 24 * 60 * 60 * 1000;
  const staleCtoff = new Date(Date.now() - STALE_TTL_MS).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const staleRounds = new Set(
    rows
      .filter((r) => r.date_event > today && r.synced_at < staleCtoff && r.round_num)
      .map((r) => parseInt(r.round_num!))
      .filter(Boolean)
  );

  return { events, roundsInDb, staleRounds };
}

/** 오늘 기준으로 결과가 아직 없는 경기가 있는 라운드 번호 반환 */
export function getPendingRounds(events: MatchEvent[]): Set<number> {
  const today = new Date().toISOString().slice(0, 10);
  const pending = new Set<number>();
  for (const e of events) {
    if (e.dateEvent <= today && !e.intHomeScore && e.intRound) {
      pending.add(parseInt(e.intRound));
    }
  }
  return pending;
}

/** 이벤트 배열을 DB에 upsert (변경된 것만 실질적으로 업데이트) */
export async function upsertEvents(
  events: MatchEvent[],
  league_key: string,
  season: string
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => toDbRow(e, league_key, season));
  const { error } = await supabaseAdmin
    .from('match_events')
    .upsert(rows, { onConflict: 'event_id' });
  if (error) throw error;
}

/** 특정 이벤트만 점수 업데이트 (완료 경기) */
export async function updateScores(
  events: MatchEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const results = await Promise.all(
    events
      .filter((e) => e.intHomeScore !== null)
      .map((e) =>
        supabaseAdmin
          .from('match_events')
          .update({
            home_score: e.intHomeScore,
            away_score: e.intAwayScore,
            synced_at: new Date().toISOString(),
          })
          .eq('event_id', e.idEvent)
      )
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw firstError;
}
