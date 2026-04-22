'use client';

import { useCallback, useEffect, useState } from 'react';
import { Prediction } from '@/types';
import ModelBadge from './ModelBadge';

interface AIPredictionBarProps {
  prediction: Prediction;
  eventId: string;
  isPlayed: boolean;
  queryParams: Record<string, string>;
  onQuotaExceeded: () => void;
  forceRefreshKey?: number;
}

export default function AIPredictionBar({
  prediction,
  eventId,
  isPlayed,
  queryParams,
  onQuotaExceeded,
  forceRefreshKey,
}: AIPredictionBarProps) {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalysis = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setFailed(false);

    const params = new URLSearchParams(queryParams);
    if (force) params.set('force', 'true');
    params.set('stream', 'true');

    try {
      const res = await fetch(`/api/analysis/${eventId}?${params.toString()}`);
      const contentType = res.headers.get('Content-Type') ?? '';

      if (contentType.startsWith('text/plain')) {
        // 스트리밍 응답: 첫 청크부터 즉시 표시
        const modelHeader = res.headers.get('X-AI-Model');
        if (modelHeader) setModel(modelHeader);
        setLoading(false);
        setRefreshing(false);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setAnalysis(accumulated);
        }
      } else {
        // JSON 응답: 캐시 히트
        const data = await res.json();
        if (data.error === 'quota_exceeded') {
          onQuotaExceeded();
          setFailed(true);
        } else if (data.content) {
          setAnalysis(data.content);
          setModel(data.model ?? null);
        } else {
          setFailed(true);
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, queryParams, onQuotaExceeded]);

  useEffect(() => { fetchAnalysis(); }, [eventId]); // eslint-disable-line
  useEffect(() => {
    if (forceRefreshKey && forceRefreshKey > 0) fetchAnalysis(true);
  }, [forceRefreshKey]); // eslint-disable-line

  const { h, d, a } = prediction;

  return (
    <div className="flex flex-col gap-3">
      {/* 경기 전 예측 배너 (완료 경기) */}
      {isPlayed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f5b301]/10 border border-[#f5b301]/30 text-[#f5b301] text-xs">
          ⚠ 이 예측은 경기 전 시점 기준입니다.
        </div>
      )}

      {/* 확률 바 */}
      <div>
        <div className="flex text-xs text-[var(--muted)] mb-1 justify-between">
          <span>홈 승 {h}%</span>
          <span>무 {d}%</span>
          <span>원정 승 {a}%</span>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden">
          <div
            className="transition-all"
            style={{ width: `${h}%`, background: '#ff5a5f' }}
          />
          <div
            className="transition-all"
            style={{ width: `${d}%`, background: '#f5b301' }}
          />
          <div
            className="transition-all"
            style={{ width: `${a}%`, background: '#3ea6ff' }}
          />
        </div>
        <div className="flex text-[11px] font-bold mt-1 justify-between">
          <span className="text-[#ff5a5f]">{h}%</span>
          <span className="text-[#f5b301]">{d}%</span>
          <span className="text-[#3ea6ff]">{a}%</span>
        </div>
      </div>

      {/* AI 분석 텍스트 */}
      <div className="mt-1">
        <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-2">
          AI 분석
          {model && <ModelBadge model={model} />}
          <button
            onClick={() => fetchAnalysis(true)}
            disabled={refreshing || loading}
            className="ml-auto text-[var(--muted)] hover:text-[#3ea6ff] disabled:opacity-40 transition-colors"
            title="다시 분석"
            aria-label="다시 분석"
          >
            <span className={refreshing ? 'inline-block animate-spin' : ''} style={{ display: 'inline-block' }}>↻</span>
          </button>
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="spin-icon text-base">⟳</span>
            <span>AI 분석 불러오는 중...</span>
          </div>
        ) : failed ? (
          <p className="text-sm text-[var(--muted)]">AI 분석을 불러올 수 없습니다.</p>
        ) : (
          <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
            {analysis}
          </p>
        )}
      </div>
    </div>
  );
}
