import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
import { BADGE_MAP } from '@/lib/badges';

const BUCKET_NAME = 'team-badges';

const KLEAGUE_EMBLEM_BASE = 'https://www.kleague.com/assets/images/emblem';

function getUniqueKcodes(): Array<{ kcode: string; kleagueUrl: string }> {
  const seen = new Set<string>();
  for (const kcode of Object.values(BADGE_MAP)) {
    seen.add(kcode);
  }
  return Array.from(seen).map((kcode) => ({
    kcode,
    kleagueUrl: `${KLEAGUE_EMBLEM_BASE}/emblem_${kcode}.png`,
  }));
}

export async function GET() {
  return syncBadges();
}

export async function POST() {
  return syncBadges();
}

async function syncBadges() {
  // 1. team-badges 버킷 생성 (이미 있으면 무시)
  try {
    const { error: bucketError } = await getSupabaseAdmin().storage.createBucket(
      BUCKET_NAME,
      { public: true }
    );
    if (bucketError && !bucketError.message.includes('already exists')) {
      console.error('[sync-badges] Bucket creation error:', bucketError);
      return NextResponse.json(
        { error: 'Failed to create storage bucket' },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('[sync-badges] Bucket creation exception:', err);
    return NextResponse.json(
      { error: 'Failed to create storage bucket' },
      { status: 500 }
    );
  }

  const uniqueKcodes = getUniqueKcodes();
  const synced: string[] = [];
  const failed: string[] = [];

  // 2. 각 kcode별 이미지 fetch 후 Storage 업로드
  for (const { kcode, kleagueUrl } of uniqueKcodes) {
    try {
      const imgRes = await fetch(kleagueUrl);
      if (!imgRes.ok) {
        console.warn(
          `[sync-badges] Failed to fetch ${kcode}: HTTP ${imgRes.status}`
        );
        failed.push(kcode);
        continue;
      }

      const arrayBuffer = await imgRes.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await getSupabaseAdmin().storage
        .from(BUCKET_NAME)
        .upload(`${kcode}.png`, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`[sync-badges] Upload error for ${kcode}:`, uploadError);
        failed.push(kcode);
      } else {
        synced.push(kcode);
      }
    } catch (err) {
      console.error(`[sync-badges] Exception for ${kcode}:`, err);
      failed.push(kcode);
    }
  }

  return NextResponse.json({ synced, failed });
}

