export interface TeamData {
  name: string;
  id?: string;
  badge?: string | null;       // Supabase Storage URL (or kleague.com fallback)
  rank?: number | null;
  played?: number | null;
  win?: number | null;
  draw?: number | null;
  loss?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDiff?: number | null;
  points?: number | null;
}

export interface MatchEvent {
  idEvent: string;
  dateEvent: string;           // YYYY-MM-DD
  strTime?: string | null;     // HH:MM:SS UTC
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strVenue?: string | null;
  intRound?: string | null;
}

export interface LeagueData {
  events: MatchEvent[];
  teamsByName: Record<string, TeamData>;
  _maxRound: number;
  _bgDone: boolean;
}

export interface Prediction {
  h: number;  // home win %
  d: number;  // draw %
  a: number;  // away win %
}

export interface H2HData {
  total: number;
  wa: number;  // wins for team A
  wb: number;  // wins for team B
  d: number;   // draws
}

export interface AnalysisResponse {
  content: string;
  provider: 'gemini' | 'groq' | 'cached';
  cached: boolean;
  error?: never;
}

export interface AnalysisErrorResponse {
  error: 'quota_exceeded' | 'server_error';
  content?: never;
}
