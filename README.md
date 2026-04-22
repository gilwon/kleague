# K리그 일정·순위 뷰어

K리그 1·2부 경기 일정, 순위표, AI 경기 분석을 제공하는 Next.js 웹앱입니다.

## 주요 기능

- K리그 1·2부 시즌별 경기 일정 및 결과
- 리그 순위표 (상위 5개 팀)
- 팀 엠블럼 표시
- AI 경기 분석 (사전 예측 / 사후 분석 / 경기 리포트)
- 자동 폴백: Gemini 2.0 Flash → Groq llama-3.3-70b

## 기술 스택

- **프레임워크**: Next.js (App Router)
- **DB**: Supabase (PostgreSQL)
- **외부 API**: [TheSportsDB](https://www.thesportsdb.com)
- **AI**: Google Gemini 2.0 Flash / Groq llama-3.3-70b-versatile

## 시작하기

### 1. 환경변수 설정

`.env.local.example`을 복사해 `.env.local`을 만들고 각 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (공개 읽기) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (쓰기) |
| `GEMINI_API_KEY` | Google AI Studio API 키 |
| `GROQ_API_KEY` | Groq API 키 |

### 2. 의존성 설치

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

## 주요 명령어

```bash
npm run dev        # 개발 서버 (localhost:3000)
npm run build      # 프로덕션 빌드
npm run lint       # ESLint
npx tsc --noEmit   # 타입 체크
```

## API 엔드포인트

| 경로 | 설명 |
|---|---|
| `GET /api/league/[key]?season=` | 시즌 전체 경기 + 순위표 |
| `GET /api/league/[key]/rounds?r=&season=` | 라운드별 경기 (배치 로드) |
| `GET /api/analysis/[eventId]` | AI 사전·사후 분석 |
| `GET /api/match-report/[eventId]` | AI 경기 리포트 (Google Search Grounding) |
| `GET /api/sync-badges` | 팀 엠블럼 Supabase Storage 동기화 |

`key`: `k1` (K리그 1) 또는 `k2` (K리그 2)

## Supabase 테이블

- **`match_events`** — 경기 일정·결과 캐시 (PK: `event_id`)
- **`ai_analysis`** — AI 분석 캐시 (unique: `event_id` + `analysis_type`)
- **`team-badges`** 버킷 — 팀 엠블럼 이미지
