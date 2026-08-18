import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// The actual client factory, deliberately free of the "server-only" guard
// (which only Next's own bundler understands — plain Node/tsx scripts like
// evals/run.ts choke on it). Next.js app code should import this via
// ./server.ts instead, which adds that guard back for accidental
// client-component imports.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
