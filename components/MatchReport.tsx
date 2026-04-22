'use client';

import { useState, useEffect, useCallback } from 'react';
import { MatchSource, REPORT_STREAM_SOURCES_MARKER } from '@/lib/ai';
import ModelBadge from './ModelBadge';

interface MatchReportProps {
  eventId: string;
  homeKo: string;
  awayKo: string;
  homeScore: string;
  awayScore: string;
  date: string;
  onQuotaExceeded: () => void;
  forceRefreshKey?: number;
}

interface ReportData {
  summary: string;
  sources: MatchSource[];
  provider: string;
  cached: boolean;
  model?: string;
}

function isYouTube(url: string) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export default function MatchReport({
  eventId,
  homeKo,
  awayKo,
  homeScore,
  awayScore,
  date,
  onQuotaExceeded,
  forceRefreshKey,
}: MatchReportProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReport = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const params = new URLSearchParams({ homeKo, awayKo, homeScore, awayScore, date });
    if (force) params.set('force', 'true');
    params.set('stream', 'true');

    try {
      const res = await fetch(`/api/match-report/${eventId}?${params}`);
      const contentType = res.headers.get('Content-Type') ?? '';

      if (contentType.startsWith('text/plain')) {
        // 스트리밍 응답
        const modelHeader = res.headers.get('X-AI-Model') ?? undefined;
        const providerHeader = res.headers.get('X-AI-Provider') ?? 'gemini';
        setLoading(false);
        setRefreshing(false);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });

          // 중간 렌더링: 마커 이전 텍스트만
          const markerIdx = accumulated.indexOf(REPORT_STREAM_SOURCES_MARKER);
          const summaryPart = markerIdx !== -1 ? accumulated.slice(0, markerIdx) : accumulated;
          setData({
            summary: summaryPart,
            sources: [],
            provider: providerHeader,
            cached: false,
            model: modelHeader,
          });
        }

        // 스트림 완료 후 sources 파싱
        const markerIdx = accumulated.indexOf(REPORT_STREAM_SOURCES_MARKER);
        if (markerIdx !== -1) {
          const summaryPart = accumulated.slice(0, markerIdx);
          const sourcesJson = accumulated.slice(markerIdx + REPORT_STREAM_SOURCES_MARKER.length);
          try {
            const sources: MatchSource[] = JSON.parse(sourcesJson);
            setData({
              summary: summaryPart,
              sources,
              provider: providerHeader,
              cached: false,
              model: modelHeader,
            });
          } catch {}
        }
      } else {
        // JSON 응답 (캐시 히트)
        const json = await res.json();
        if (json.error === 'quota_exceeded') {
          onQuotaExceeded();
          setError('AI 분석 한도 초과. 잠시 후 다시 시도해주세요.');
        } else if (json.error) {
          setError('경기 리포트를 불러오지 못했습니다.');
        } else {
          setData(json);
        }
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, homeKo, awayKo, homeScore, awayScore, date, onQuotaExceeded]);

  useEffect(() => { fetchReport(); }, [eventId]); // eslint-disable-line
  useEffect(() => {
    if (forceRefreshKey && forceRefreshKey > 0) fetchReport(true);
  }, [forceRefreshKey]); // eslint-disable-line

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-[var(--panel2)] rounded w-3/4" />
        <div className="h-4 bg-[var(--panel2)] rounded w-full" />
        <div className="h-4 bg-[var(--panel2)] rounded w-5/6" />
        <div className="h-4 bg-[var(--panel2)] rounded w-2/3" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-[var(--muted)]">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* 요약 텍스트 */}
      <div className="relative">
        {refreshing && (
          <div className="absolute inset-0 bg-[var(--panel)]/60 flex items-center justify-center rounded">
            <span className="text-[#3ea6ff] animate-spin text-xl">↻</span>
          </div>
        )}
        <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
          {data.summary}
        </p>
      </div>

      {/* 출처 링크 */}
      {data.sources.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider mb-2">
            참고 출처
          </p>
          <div className="flex flex-col gap-1.5">
            {data.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[#3ea6ff] hover:underline truncate group"
              >
                {/* 유튜브 아이콘 vs 일반 기사 아이콘 */}
                {isYouTube(src.url) ? (
                  <span className="shrink-0 text-[#ea3943]">▶</span>
                ) : (
                  <span className="shrink-0 text-[var(--muted)]">📄</span>
                )}
                <span className="truncate">{src.title || getDomain(src.url)}</span>
                <span className="shrink-0 text-[var(--muted)] text-[10px]">
                  {getDomain(src.url)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 분석 제공자 정보 */}
      <div className="flex items-center gap-1.5">
        <ModelBadge model={data.model} provider={data.provider} cached={data.cached} />
        {data.sources.length === 0 && data.provider === 'groq' && (
          <span className="text-[10px] text-[var(--muted)]">학습 데이터 기반 분석</span>
        )}
        <button
          onClick={() => fetchReport(true)}
          disabled={refreshing}
          className="ml-auto text-[var(--muted)] hover:text-[#3ea6ff] disabled:opacity-40 transition-colors text-sm"
          title="다시 분석"
          aria-label="다시 분석"
        >
          <span className={refreshing ? 'inline-block animate-spin' : ''} style={{ display: 'inline-block' }}>↻</span>
        </button>
      </div>
    </div>
  );
}
