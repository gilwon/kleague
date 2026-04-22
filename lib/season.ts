export function getCurrentSeason(): string {
  return String(new Date().getFullYear());
}

/** 현재 연도 포함 직전 2개 시즌 반환 (내림차순) */
export function getAvailableSeasons(): string[] {
  const cur = new Date().getFullYear();
  return [String(cur), String(cur - 1), String(cur - 2)];
}

/** 이전 시즌(모든 라운드가 완료된 상태)인지 여부 */
export function isPastSeason(season: string): boolean {
  return parseInt(season) < new Date().getFullYear();
}
