import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Backed by Postgres (see supabase/migrations/0003_rate_limits.sql) because
// Vercel's serverless instances don't share memory — an in-process counter
// would look like it works while limiting almost nothing.

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

// On Vercel the platform sets these headers itself, so the client can't spoof
// them. Only a hash is stored — never the raw address.
function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip") ?? forwarded ?? "unknown";
  return createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? ""}|${ip}`)
    .digest("hex")
    .slice(0, 32);
}

type Consumed = { allowed: boolean; retryAfter: number };

async function consume(key: string, windowSeconds: number, limit: number, cost = 1): Promise<Consumed> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
    p_cost: cost,
  });
  const row = data?.[0];
  if (error || !row) throw new Error(error?.message ?? "rate limit check returned no row");
  return { allowed: row.out_allowed, retryAfter: row.out_retry_after };
}

function tooMany(message: string, retryAfter: number) {
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

/**
 * Guards a route that makes billed Anthropic calls. Returns a response to send
 * back if the call must be refused, or null if it may proceed.
 *
 * Three limits, all from env with conservative defaults:
 *  - ANALYZE_PER_IP_PER_HOUR  (default 10)   per visitor
 *  - DAILY_AI_CALL_CAP        (default 25)   across all visitors, per UTC day
 *  - MONTHLY_AI_CALL_CAP      (default 200)  across all visitors, per 30-day window
 *
 * `cost` is how many billed agent runs this request will make.
 * Fails closed: if the limiter itself errors, the call is refused rather than
 * allowed, because the whole point is to cap spend.
 */
export async function guardBilledCall(request: Request, scope: string, cost = 1): Promise<NextResponse | null> {
  try {
    const perIp = await consume(
      `ip:${scope}:${clientId(request)}`,
      HOUR,
      intFromEnv("ANALYZE_PER_IP_PER_HOUR", 10),
      cost,
    );
    if (!perIp.allowed) {
      return tooMany("Too many requests from your connection. Please try again later.", perIp.retryAfter);
    }

    const daily = await consume("global:ai-calls:day", DAY, intFromEnv("DAILY_AI_CALL_CAP", 25), cost);
    if (!daily.allowed) {
      return tooMany(
        "This demo has reached its daily AI budget. The sample tickets that were already analyzed are still browsable — try new analyses again tomorrow.",
        daily.retryAfter,
      );
    }

    const monthly = await consume("global:ai-calls:30d", MONTH, intFromEnv("MONTHLY_AI_CALL_CAP", 200), cost);
    if (!monthly.allowed) {
      return tooMany(
        "This demo has reached its monthly AI budget. The sample tickets that were already analyzed are still browsable.",
        monthly.retryAfter,
      );
    }
    return null;
  } catch (err) {
    console.error("rate limiter failed, refusing billed call:", err);
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }
}
