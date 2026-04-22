import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import Groq from 'groq-sdk';

type Provider = 'gemini' | 'groq';

const KOREAN_SYSTEM = '당신은 K리그 전문 분석가입니다. 반드시 순수한 한국어(한글)로만 답변하세요. 한자, 중국어, 일본어, 독일어, 영어 등 다른 언어는 절대 사용하지 마세요.';

/** 한글·숫자·기본 구두점만 허용 (화이트리스트) — 아랍어·러시아어·태국어 등 모든 비한글 제거 */
export function filterForeignChars(text: string): string {
  return text
    .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF0-9\s.,!?:;'"()\-\[\]·~\/%]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isQuotaOrUnavailableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('429') || msg.includes('quota') || msg.includes('503')) return true;
  }
  if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) return true;
  return false;
}

/**
 * AI 텍스트 생성.
 * 1순위: Gemini 2.0 Flash Lite
 * 2순위: Groq llama-3.3-70b-versatile
 */
export async function generateAnalysis(
  prompt: string
): Promise<{ text: string; provider: Provider; model: string }> {
  // --- Gemini ---
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      systemInstruction: KOREAN_SYSTEM,
    });
    const result = await model.generateContent(prompt);
    const text = filterForeignChars(result.response.text());
    return { text, provider: 'gemini', model: 'gemini-2.0-flash-lite' };
  } catch (geminiErr) {
    if (!isQuotaOrUnavailableError(geminiErr)) {
      console.error('[AI] Gemini error, falling back to Groq:', geminiErr);
    } else {
      console.warn('[AI] Gemini quota/unavailable, falling back to Groq');
    }
  }

  // --- Groq 폴백 ---
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KOREAN_SYSTEM },
        { role: 'user', content: prompt },
      ],
      max_tokens: 512,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    return { text: filterForeignChars(raw), provider: 'groq', model: 'llama-3.3-70b-versatile' };
  } catch (groqErr) {
    console.error('[AI] Groq error:', groqErr);
    throw new Error('AI providers exhausted');
  }
}

/**
 * Gemini generateContentStream → ReadableStream 반환.
 * Gemini 쿼터 소진 시 Groq 비스트리밍을 ReadableStream으로 래핑하여 폴백.
 */
export async function generateAnalysisStream(
  prompt: string
): Promise<{ stream: ReadableStream<Uint8Array>; model: string; provider: string }> {
  // --- Gemini 스트리밍 ---
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      systemInstruction: KOREAN_SYSTEM,
    });
    const result = await geminiModel.generateContentStream(prompt);

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
        } finally {
          controller.close();
        }
      },
    });

    return { stream: readable, model: 'gemini-2.0-flash-lite', provider: 'gemini' };
  } catch (geminiErr) {
    if (!isQuotaOrUnavailableError(geminiErr)) {
      console.error('[AI] Gemini stream error, falling back:', geminiErr);
    } else {
      console.warn('[AI] Gemini quota/unavailable, falling back to Groq');
    }
  }

  // --- Groq 폴백 (비스트리밍을 ReadableStream으로 래핑) ---
  const { text, provider, model } = await generateAnalysis(prompt);
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return { stream: readable, model, provider };
}

// ─────────────────────────────────────────
// 경기 리포트: Google Search Grounding 활용
// ─────────────────────────────────────────

export interface MatchSource {
  title: string;
  url: string;
}

export interface MatchReportResult {
  summary: string;
  sources: MatchSource[];
  provider: Provider;
  model: string;
}

/**
 * 완료된 경기에 대해 Google Search Grounding으로 기사·유튜브를 참고하여 요약 리포트 생성.
 * Gemini 실패 시 Groq으로 폴백 (출처 없이 일반 지식 기반).
 */
export async function generateMatchReport(
  homeKo: string,
  awayKo: string,
  homeScore: string,
  awayScore: string,
  dateStr: string
): Promise<MatchReportResult> {
  const query = `너는 K리그 전문 해설위원이야. 반드시 순수한 한국어(한글)로만 작성해. 한자나 다른 언어는 절대 쓰지 마. K리그 ${homeKo}(홈) ${homeScore}-${awayScore} ${awayKo}(원정) ${dateStr} 경기의 하이라이트·골 장면·승부 포인트를 유튜브와 뉴스 기사를 참고해 600자 이내로 상세히 작성하세요.`;

  // --- Gemini + Google Search Grounding ---
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} } as Tool],
      systemInstruction: KOREAN_SYSTEM,
    });

    const result = await model.generateContent(query);
    const candidate = result.response.candidates?.[0];
    const raw = candidate?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') ?? '';
    const summary = filterForeignChars(raw);

    const chunks = (candidate?.groundingMetadata as { groundingChunks?: { web?: { uri?: string; title?: string } }[] } | undefined)?.groundingChunks ?? [];
    const sources: MatchSource[] = chunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ title: c.web!.title ?? c.web!.uri!, url: c.web!.uri! }))
      .slice(0, 5);

    return { summary, sources, provider: 'gemini', model: 'gemini-2.0-flash' };
  } catch (geminiErr) {
    console.warn('[MatchReport] Gemini failed, falling back to Groq:', geminiErr);
  }

  // --- Groq 폴백 ---
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
    const fallbackPrompt = `K리그 ${homeKo}(홈) ${homeScore}-${awayScore} ${awayKo}(원정) ${dateStr} 경기 결과를 바탕으로 경기 흐름과 결과의 의미를 600자 이내로 분석하세요. 반드시 한국어(한글)로만 작성하고 한자나 외국어는 절대 사용하지 마세요.`;
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KOREAN_SYSTEM },
        { role: 'user', content: fallbackPrompt },
      ],
      max_tokens: 700,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    return { summary: filterForeignChars(raw), sources: [], provider: 'groq', model: 'llama-3.3-70b-versatile' };
  } catch (groqErr) {
    console.error('[MatchReport] Groq error:', groqErr);
    throw new Error('AI providers exhausted');
  }
}

export const REPORT_STREAM_SOURCES_MARKER = '\n\x00SOURCES\x00';

/**
 * match-report 스트리밍 버전.
 * Google Search Grounding으로 summary를 스트리밍하고, 스트림 끝에 \x00SOURCES\x00{json} 마커를 추가.
 * Gemini 실패 시 비스트리밍 결과를 동일 포맷으로 래핑하여 폴백.
 */
export async function generateMatchReportStream(
  homeKo: string,
  awayKo: string,
  homeScore: string,
  awayScore: string,
  dateStr: string
): Promise<{ stream: ReadableStream<Uint8Array>; model: string; provider: string }> {
  const query = `너는 K리그 전문 해설위원이야. 반드시 순수한 한국어(한글)로만 작성해. 한자나 다른 언어는 절대 쓰지 마. K리그 ${homeKo}(홈) ${homeScore}-${awayScore} ${awayKo}(원정) ${dateStr} 경기의 하이라이트·골 장면·승부 포인트를 유튜브와 뉴스 기사를 참고해 600자 이내로 상세히 작성하세요.`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} } as Tool],
      systemInstruction: KOREAN_SYSTEM,
    });
    const result = await geminiModel.generateContentStream(query);

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
          // 스트림 완료 후 grounding 출처 추출
          const response = await result.response;
          const groundingChunks =
            (response.candidates?.[0]?.groundingMetadata as { groundingChunks?: { web?: { uri?: string; title?: string } }[] } | undefined)
              ?.groundingChunks ?? [];
          const sources: MatchSource[] = groundingChunks
            .filter((c) => c.web?.uri)
            .map((c) => ({ title: c.web!.title ?? c.web!.uri!, url: c.web!.uri! }))
            .slice(0, 5);
          controller.enqueue(
            new TextEncoder().encode(`${REPORT_STREAM_SOURCES_MARKER}${JSON.stringify(sources)}`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return { stream: readable, model: 'gemini-2.0-flash', provider: 'gemini' };
  } catch (err) {
    console.warn('[MatchReportStream] Gemini failed, wrapping fallback:', err);
  }

  // Groq 폴백: 비스트리밍 결과를 동일 포맷으로 래핑
  const fallback = await generateMatchReport(homeKo, awayKo, homeScore, awayScore, dateStr);
  const payload = `${fallback.summary}${REPORT_STREAM_SOURCES_MARKER}${JSON.stringify(fallback.sources)}`;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return { stream: readable, model: fallback.model, provider: fallback.provider };
}
