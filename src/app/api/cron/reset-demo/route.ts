import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else is refused, and if the
// secret isn't configured the route refuses everything rather than running
// open. The reset itself is plain SQL (supabase/migrations/0004_reset_demo.sql)
// and makes no Anthropic calls, so it costs nothing.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createServiceClient().rpc("reset_demo");
  if (error) {
    console.error("demo reset failed:", error);
    return NextResponse.json({ error: "Reset failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, number>) });
}
