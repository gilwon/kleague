import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _anon: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

export function getSupabaseAnon(): SupabaseClient {
  if (!_anon) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase anon env vars missing');
    _anon = createClient(url, key);
  }
  return _anon;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase admin env vars missing');
    _admin = createClient(url, key);
  }
  return _admin;
}
