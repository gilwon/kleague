import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabaseAnon } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
import { generateMatchReport, generateMatchReportStream, filterForeignChars, REPORT_STREAM_SOURCES_MARKER, MatchSource } from '@/lib/ai';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const sp = request.nextUrl.searchParams;

  const homeKo   = sp.get('homeKo')    ?? '';
  const awayKo   = sp.get('awayKo')    ?? '';
  const homeScore = sp.get('homeScore') ?? '';
  const awayScore = sp.get('awayScore') ?? '';
  const dateStr  = sp.get('date')       ?? '';

  if (!homeKo || !awayKo || !homeScore || !awayScore) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const force = sp.get('force') === 'true';

  // ─── 1. Supabase 캐시 확인 (force=true면 건너뜀) ────────
  if (!force) {
    try {
      const { data } = await getSupabaseAnon()
        .from('ai_analysis')
        .select('content, provider, model')
        .eq('event_id', eventId)
        .eq('analysis_type', 'report')
        .maybeSingle();

      if (data?.content) {
        const parsed = JSON.parse(data.content);
        return NextResponse.json({ ...parsed, model: data.model, cached: true });
      }
    } catch (e) {
      console.warn('[match-report] cache read error:', e);
    }
  }

  // ─── 2-a. 스트리밍 모드 (?stream=true) ──────────────────
  if (sp.get('stream') === 'true') {
    try {
      const { stream, model, provider } = await generateMatchReportStream(
        homeKo, awayKo, homeScore, awayScore, dateStr
      );

      const allChunks: string[] = [];
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          allChunks.push(new TextDecoder().decode(chunk, { stream: true }));
          controller.enqueue(chunk);
        },
        flush() {
          const fullText = allChunks.join('');
          const markerIdx = fullText.indexOf(REPORT_STREAM_SOURCES_MARKER);
          const summaryRaw = markerIdx !== -1 ? fullText.slice(0, markerIdx) : fullText;
          const summary = filterForeignChars(summaryRaw);
          const sourcesJson = markerIdx !== -1 ? fullText.slice(markerIdx + REPORT_STREAM_SOURCES_MARKER.length) : '[]';
          let sources: MatchSource[] = [];
          try { sources = JSON.parse(sourcesJson); } catch {}

          if (summary) {
            const content = JSON.stringify({ summary, sources, provider, model });
            void getSupabaseAdmin()
              .from('ai_analysis')
              .upsert(
                { event_id: eventId, analysis_type: 'report', provider, content, model },
                { onConflict: 'event_id,analysis_type' }
              )
              .then(({ error }) => {
                if (error) console.error('[match-report] stream upsert error:', error);
              });
          }
        },
      });

      stream.pipeTo(writable).catch((e) => console.error('[match-report] stream pipe error:', e));

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-AI-Model': model,
          'X-AI-Provider': provider,
        },
      });
    } catch (streamErr) {
      console.error('[match-report] stream failed:', streamErr);
      return NextResponse.json({ error: 'quota_exceeded' }, { status: 503 });
    }
  }

  // ─── 2. AI 생성 ──────────────────────────────────────────
  try {
    const result = await generateMatchReport(
      homeKo, awayKo, homeScore, awayScore, dateStr
    );

    const payload = {
      summary: result.summary,
      sources: result.sources,
      provider: result.provider,
      model: result.model,
    };

    // ─── 3. Supabase 저장 ────────────────────────────────────
    await getSupabaseAdmin()
      .from('ai_analysis')
      .upsert(
        {
          event_id: eventId,
          analysis_type: 'report',
          provider: result.provider,
          content: JSON.stringify(payload),
          model: result.model,
        },
        { onConflict: 'event_id,analysis_type' }
      );

    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[match-report] generation/save error:', err);
    return NextResponse.json({ error: 'quota_exceeded' }, { status: 503 });
  }
}
