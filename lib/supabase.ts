import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * 클라이언트/서버 공용 익명 클라이언트.
 * SELECT(공개 데이터) 용도.
 */
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 서버 전용 관리자 클라이언트.
 * INSERT, Storage 업로드 등 service role key가 필요한 작업에 사용.
 * 절대 클라이언트 컴포넌트에 노출하지 말 것.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
