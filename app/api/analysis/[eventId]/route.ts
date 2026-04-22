import { NextRequest, NextResponse } from 'next/server';
import { generateAnalysis, generateAnalysisStream, filterForeignChars } from '@/lib/ai';
import { supabaseAnon, supabaseAdmin } from '@/lib/supabase';
import { KO } from '@/lib/football';
import type { Prediction, H2HData } from '@/types';

function buildPrePromptFromParams(params: URLSearchParams): string {
  const home = params.get('home') ?? '';
  const away = params.get('away') ?? '';
  const hk = KO[home] || home;
  const ak = KO[away] || away;

  const homeRank = params.get('homeRank');
  const homePoints = params.get('homePoints');
  const homeRecord = params.get('homeRecord') ?? '순위 없음';
  const awayRank = params.get('awayRank');
  const awayPoints = params.get('awayPoints');
  const awayRecord = params.get('awayRecord') ?? '순위 없음';

  const hR =
    homeRank && homePoints
      ? `${homeRank}위 ${homePoints}pt (${homeRecord})`
      : '순위 없음';
  const aR =
    awayRank && awayPoints
      ? `${awayRank}위 ${awayPoints}pt (${awayRecord})`
      : '순위 없음';

  const hForm = params.get('hForm') || '없음';
  const aForm = params.get('aForm') || '없음';
  const h2h = params.get('h2h') || '기록 없음';

  const pred: Prediction = {
    h: parseInt(params.get('predH') ?? '33'),
    d: parseInt(params.get('predD') ?? '34'),
    a: parseInt(params.get('predA') ?? '33'),
  };

  return `K리그 전문 분석가로서 아래 경기를 300자 이내 한국어로 간결하게 전망하세요.

[경기] ${hk}(홈) vs ${ak}(원정)
[홈팀] ${hR} / 최근 5경기 폼: ${hForm}
[원정팀] ${aR} / 최근 5경기 폼: ${aForm}
[상대전적] ${h2h}
[예측] 홈승 ${pred.h}% / 무승부 ${pred.d}% / 원정승 ${pred.a}%

양 팀 현재 폼, 순위 격차, 홈 어드밴티지를 고려해 핵심만 분석하세요.`;
}

function buildPostPromptFromParams(params: URLSearchParams): string {
  const home = params.get('home') ?? '';
  const away = params.get('away') ?? '';
  const hk = KO[home] || home;
  const ak = KO[away] || away;
  const hs = params.get('homeScore') ?? '?';
  const as_ = params.get('awayScore') ?? '?';

  const homeRank = params.get('homeRank');
  const homePoints = params.get('homePoints');
  const awayRank = params.get('awayRank');
  const awayPoints = params.get('awayPoints');

  const hR =
    homeRank && homePoints ? `${homeRank}위 ${homePoints}pt` : '순위 없음';
  const aR =
    awayRank && awayPoints ? `${awayRank}위 ${awayPoints}pt` : '순위 없음';

  const hForm = params.get('hForm') || '없음';
  const aForm = params.get('aForm') || '없음';
  const h2h = params.get('h2h') || '기록 없음';

  return `K리그 전문 분석가로서 아래 경기 결과를 300자 이내 한국어로 간결하게 분석하세요.

[경기] ${hk}(홈) ${hs}-${as_} ${ak}(원정)
[홈팀] ${hR} / 최근 5경기 폼: ${hForm}
[원정팀] ${aR} / 최근 5경기 폼: ${aForm}
[상대전적] ${h2h}

결과의 의미, 양 팀 폼 상태, 순위 영향을 핵심만 분석하세요.`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type');

  if (type !== 'pre' && type !== 'post') {
    return NextResponse.json(
      { error: 'Invalid type. Must be "pre" or "post".' },
      { status: 400 }
    );
  }

  const force = searchParams.get('force') === 'true';

  // 1. Supabase 캐시 조회 (force=true면 건너뜀)
  if (!force) {
    try {
      const { data, error } = await supabaseAnon
        .from('ai_analysis')
        .select('content, provider, model')
        .eq('event_id', eventId)
        .eq('analysis_type', type)
        .single();

      if (!error && data) {
        return NextResponse.json({
          content: data.content,
          provider: 'cached' as const,
          model: data.model,
          cached: true,
        });
      }
    } catch (dbErr) {
      console.error('[/api/analysis] Supabase SELECT error:', dbErr);
      // DB 에러는 무시하고 AI 생성 진행
    }
  }

  // 2. 프롬프트 생성
  const prompt =
    type === 'pre'
      ? buildPrePromptFromParams(searchParams)
      : buildPostPromptFromParams(searchParams);

  // 3-a. 스트리밍 모드 (?stream=true)
  if (searchParams.get('stream') === 'true') {
    try {
      const { stream, model, provider } = await generateAnalysisStream(prompt);

      // TransformStream으로 청크를 포착하여 스트리밍 완료 후 DB 저장
      const allChunks: string[] = [];
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          allChunks.push(new TextDecoder().decode(chunk, { stream: true }));
          controller.enqueue(chunk);
        },
        flush() {
          const fullText = filterForeignChars(allChunks.join(''));
          if (fullText) {
            void supabaseAdmin
              .from('ai_analysis')
              .upsert(
                { event_id: eventId, analysis_type: type, provider, content: fullText, model },
                { onConflict: 'event_id,analysis_type' }
              )
              .then(({ error }) => {
                if (error) console.error('[/api/analysis] stream upsert error:', error);
              });
          }
        },
      });

      stream.pipeTo(writable).catch((e) => console.error('[/api/analysis] stream pipe error:', e));

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-AI-Model': model,
          'X-AI-Provider': provider,
        },
      });
    } catch (streamErr) {
      console.error('[/api/analysis] stream failed:', streamErr);
      return NextResponse.json({ error: 'quota_exceeded' as const }, { status: 503 });
    }
  }

  // 3-b. 비스트리밍 (기존 동작)
  try {
    const { text, provider, model } = await generateAnalysis(prompt);

    // 4. Supabase upsert (중복 요청 시 unique 충돌 방지)
    try {
      await supabaseAdmin.from('ai_analysis').upsert(
        { event_id: eventId, analysis_type: type, provider, content: text, model },
        { onConflict: 'event_id,analysis_type' }
      );
    } catch (insertErr) {
      console.error('[/api/analysis] Supabase upsert error:', insertErr);
    }

    return NextResponse.json({ content: text, provider, model, cached: false });
  } catch (_aiErr) {
    console.error('[/api/analysis] AI generation failed:', _aiErr);
    return NextResponse.json(
      { error: 'quota_exceeded' as const },
      { status: 503 }
    );
  }
}
