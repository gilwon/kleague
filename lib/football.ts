import type { MatchEvent, TeamData, Prediction, H2HData } from '@/types';

export const KO: Record<string, string> = {
  'FC Seoul': 'FC 서울',
  'Jeonbuk Hyundai Motors': '전북 현대 모터스',
  'Ulsan HD FC': '울산 HD FC',
  'Ulsan HD': '울산 HD FC',
  'Pohang Steelers': '포항 스틸러스',
  'Gimcheon Sangmu FC': '김천 상무 FC',
  'Gimcheon Sangmu': '김천 상무 FC',
  'Gwangju FC': '광주 FC',
  'Incheon United': '인천 유나이티드',
  'Gangwon FC': '강원 FC',
  'Daejeon Citizen': '대전 하나 시티즌',
  'Daejeon Hana Citizen': '대전 하나 시티즌',
  'Daegu FC': '대구 FC',
  'Suwon FC': '수원 FC',
  'Jeju United': '제주 유나이티드',
  'Jeju SK': '제주 유나이티드',
  'Bucheon FC 1995': '부천 FC 1995',
  'Seongnam FC': '성남 FC',
  'Chungnam Asan FC': '충남 아산 FC',
  'Chungnam Asan': '충남 아산 FC',
  'Jeonnam Dragons': '전남 드래곤즈',
  'Busan IPark': '부산 아이파크',
  'Ansan Greeners': '안산 그리너스',
  'Gyeongnam FC': '경남 FC',
  'FC Anyang': 'FC 안양',
  'Seoul E-Land FC': '서울 E랜드 FC',
  'Seoul E-Land': '서울 E랜드 FC',
  'Chungbuk Cheongju FC': '충북 청주 FC',
  'Chungbuk Cheongju': '충북 청주 FC',
  'Gimpo FC': '김포 FC',
  'Suwon Samsung Bluewings': '수원 삼성 블루윙즈',
  'Anyang': 'FC 안양',
  'Gimpo Citizen': '김포 FC',
  'Sangju Sangmu': '상주 상무',
  'Incheon United FC': '인천 유나이티드',
  'Jeju United FC': '제주 유나이티드',
  'Ulsan Hyundai FC': '울산 HD FC',
  'Gimhae FC': '김해 FC',
  'Hwaseong FC': '화성 FC',
  'Yongin FC': '용인 FC',
  'Paju Frontier': '파주 시민',
  'Cheonan City': '천안 시티 FC',
};

export const ko = (name: string): string => KO[name] || name;

export function formatKSTTime(strTime: string | null | undefined): string {
  if (!strTime) return 'TBD';
  const [h, m] = strTime.split(':').map(Number);
  const kst = (h + 9) % 24;
  return `${String(kst).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

export function recentForm(
  name: string,
  events: MatchEvent[],
  n = 5
): string[] {
  const played = events
    .filter(
      (e) =>
        (e.strHomeTeam === name || e.strAwayTeam === name) &&
        e.intHomeScore !== null &&
        e.intHomeScore !== ''
    )
    .sort(
      (a, b) =>
        new Date(b.dateEvent).getTime() - new Date(a.dateEvent).getTime()
    );

  const form: string[] = played.slice(0, n).map((e) => {
    const isH = e.strHomeTeam === name;
    const gs = parseInt(isH ? e.intHomeScore! : e.intAwayScore!);
    const gc = parseInt(isH ? e.intAwayScore! : e.intHomeScore!);
    return gs > gc ? 'W' : gs < gc ? 'L' : 'D';
  });

  while (form.length < n) form.push('-');
  return form;
}

export function h2h(
  a: string,
  b: string,
  events: MatchEvent[]
): H2HData {
  const ms = events.filter(
    (e) =>
      ((e.strHomeTeam === a && e.strAwayTeam === b) ||
        (e.strHomeTeam === b && e.strAwayTeam === a)) &&
      e.intHomeScore !== null &&
      e.intHomeScore !== ''
  );

  let wa = 0, wb = 0, d = 0;
  for (const e of ms) {
    const hs = parseInt(e.intHomeScore!);
    const as_ = parseInt(e.intAwayScore!);
    if (hs === as_) {
      d++;
    } else if (
      (e.strHomeTeam === a && hs > as_) ||
      (e.strAwayTeam === a && as_ > hs)
    ) {
      wa++;
    } else {
      wb++;
    }
  }

  return { total: ms.length, wa, wb, d };
}

export function strengths(
  name: string,
  teamsByName: Record<string, TeamData>,
  events: MatchEvent[]
): string {
  const t = teamsByName[name];
  if (t && t.rank !== null && t.rank !== undefined) {
    return [
      `리그 ${t.rank}위 (${t.points}pt)`,
      `${t.win}승 ${t.draw}무 ${t.loss}패`,
      `득 ${t.goalsFor} / 실 ${t.goalsAgainst} (차 ${(t.goalDiff ?? 0) >= 0 ? '+' : ''}${t.goalDiff})`,
    ].join('\n');
  }

  const form = recentForm(name, events, 5).filter((f) => f !== '-');
  if (!form.length) return '데이터 없음';

  const w = form.filter((f) => f === 'W').length;
  const d2 = form.filter((f) => f === 'D').length;
  const l = form.filter((f) => f === 'L').length;
  return [
    `최근 ${form.length}경기 ${w}승 ${d2}무 ${l}패`,
    `승률 ${Math.round((w / form.length) * 100)}%`,
  ].join('\n');
}

export function predict(
  hName: string,
  aName: string,
  teamsByName: Record<string, TeamData>,
  events: MatchEvent[],
  historyEvents?: MatchEvent[]  // H2H 계산용 (여러 시즌 합산)
): Prediction {
  // 최근 폼 가중 점수 (최신 경기 우선, 0~1)
  function fs(name: string): number {
    const form = recentForm(name, events, 5);
    let score = 0, w = 1, tot = 0;
    for (const f of [...form].reverse()) {
      if (f !== '-') {
        score += (f === 'W' ? 3 : f === 'D' ? 1 : 0) * w;
        tot += 3 * w;
      }
      w++;
    }
    return tot > 0 ? score / tot : 0.5;
  }

  // 경기당 승점 정규화 (0~1)
  function ppg(name: string): number {
    const t = teamsByName[name];
    return t && t.played && t.played > 0 && t.points !== null && t.points !== undefined
      ? Math.min(t.points / t.played / 3, 1)
      : fs(name);
  }

  // 팀의 홈 경기 실제 승률 (0~1)
  function homeWinRate(name: string): number {
    const played = events.filter(
      (e) => e.strHomeTeam === name && e.intHomeScore !== null && e.intHomeScore !== ''
    );
    if (played.length === 0) return 0.55;
    const wins = played.filter(
      (e) => parseInt(e.intHomeScore!) > parseInt(e.intAwayScore!)
    ).length;
    return wins / played.length;
  }

  // 팀의 원정 경기 실제 승률 (0~1)
  function awayWinRate(name: string): number {
    const played = events.filter(
      (e) => e.strAwayTeam === name && e.intHomeScore !== null && e.intHomeScore !== ''
    );
    if (played.length === 0) return 0.35;
    const wins = played.filter(
      (e) => parseInt(e.intAwayScore!) > parseInt(e.intHomeScore!)
    ).length;
    return wins / played.length;
  }

  // 상대전적: 홈팀 기준 점수 (여러 시즌 데이터 우선, 없으면 0.5 중립)
  const h2hData = h2h(hName, aName, historyEvents ?? events);
  const h2hHome = h2hData.total > 0
    ? (h2hData.wa * 3 + h2hData.d) / (h2hData.total * 3)
    : 0.5;
  const h2hAway = h2hData.total > 0
    ? (h2hData.wb * 3 + h2hData.d) / (h2hData.total * 3)
    : 0.5;

  // 종합 점수: 폼 40% + 순위승점 25% + 상대전적 20% + 홈/원정 실제승률 15%
  const hS = 0.40 * fs(hName) + 0.25 * ppg(hName) + 0.20 * h2hHome + 0.15 * homeWinRate(hName);
  const aS = 0.40 * fs(aName) + 0.25 * ppg(aName) + 0.20 * h2hAway + 0.15 * awayWinRate(aName);

  const diff = hS - aS;

  let ph = Math.max(0.08, Math.min(0.80, 0.5 + diff * 1.5));
  let pa = Math.max(0.08, Math.min(0.80, 0.5 - diff * 1.5));
  let pd = Math.max(0.10, 1 - ph - pa);
  const sum = ph + pd + pa;
  ph /= sum;
  pd /= sum;
  pa /= sum;

  return {
    h: Math.round(ph * 100),
    d: Math.round(pd * 100),
    a: Math.round(pa * 100),
  };
}

export function buildPrePrompt(
  hN: string,
  aN: string,
  pred: Prediction,
  h2hData: H2HData,
  hForm: string[],
  aForm: string[],
  teamsByName: Record<string, TeamData>
): string {
  const hk = KO[hN] || hN;
  const ak = KO[aN] || aN;
  const ht = teamsByName[hN];
  const at = teamsByName[aN];
  const hR =
    ht?.rank
      ? `${ht.rank}위 ${ht.points}pt (${ht.win}승 ${ht.draw}무 ${ht.loss}패)`
      : '순위 없음';
  const aR =
    at?.rank
      ? `${at.rank}위 ${at.points}pt (${at.win}승 ${at.draw}무 ${at.loss}패)`
      : '순위 없음';
  const hF = hForm.filter((f) => f !== '-').join('') || '없음';
  const aF = aForm.filter((f) => f !== '-').join('') || '없음';
  const h2hStr =
    h2hData.total > 0
      ? `${hk} ${h2hData.wa}승 ${h2hData.d}무 ${h2hData.wb}패`
      : '기록 없음';

  return `K리그 전문 분석가로서 아래 경기를 300자 이내 한국어로 간결하게 전망하세요.

[경기] ${hk}(홈) vs ${ak}(원정)
[홈팀] ${hR} / 최근 5경기 폼: ${hF}
[원정팀] ${aR} / 최근 5경기 폼: ${aF}
[상대전적] ${h2hStr}
[예측] 홈승 ${pred.h}% / 무승부 ${pred.d}% / 원정승 ${pred.a}%

양 팀 현재 폼, 순위 격차, 홈 어드밴티지를 고려해 핵심만 분석하세요.`;
}

export function buildPostPrompt(
  e: MatchEvent,
  hForm: string[],
  aForm: string[],
  h2hData: H2HData,
  teamsByName: Record<string, TeamData>
): string {
  const hk = KO[e.strHomeTeam] || e.strHomeTeam;
  const ak = KO[e.strAwayTeam] || e.strAwayTeam;
  const hs = e.intHomeScore;
  const as_ = e.intAwayScore;
  const ht = teamsByName[e.strHomeTeam];
  const at = teamsByName[e.strAwayTeam];
  const hR = ht?.rank ? `${ht.rank}위 ${ht.points}pt` : '순위 없음';
  const aR = at?.rank ? `${at.rank}위 ${at.points}pt` : '순위 없음';
  const hF = hForm.filter((f) => f !== '-').join('') || '없음';
  const aF = aForm.filter((f) => f !== '-').join('') || '없음';
  const h2hStr =
    h2hData.total > 0
      ? `${hk} ${h2hData.wa}승 ${h2hData.d}무 ${h2hData.wb}패`
      : '기록 없음';

  return `K리그 전문 분석가로서 아래 경기 결과를 300자 이내 한국어로 간결하게 분석하세요.

[경기] ${hk}(홈) ${hs}-${as_} ${ak}(원정)
[홈팀] ${hR} / 최근 5경기 폼: ${hF}
[원정팀] ${aR} / 최근 5경기 폼: ${aF}
[상대전적] ${h2hStr}

결과의 의미, 양 팀 폼 상태, 순위 영향을 핵심만 분석하세요.`;
}
