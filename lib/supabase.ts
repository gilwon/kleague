// Supabase clients are lazy-initialized to avoid crashes at build time.
// createClient is never called at module evaluation — only on first request.

let _anon: import('@supabase/supabase-js').SupabaseClient | null = null;
let _admin: import('@supabase/supabase-js').SupabaseClient | null = null;

export function getSupabaseAnon() {
  if (!_anon) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js');
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _anon!;
}

export function getSupabaseAdmin() {
  if (!_admin) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js');
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _admin!;
}
