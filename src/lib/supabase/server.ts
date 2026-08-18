import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Server-only client using the service role key. Never import this from
// client components — it bypasses row-level security.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
