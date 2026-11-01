import { NextResponse } from "next/server";

// Browsers always attach an Origin header to cross-site POSTs, so a request
// that names a different site than the one serving it is some other website
// driving a visitor's browser at these endpoints. The app's own UI only ever
// calls same-origin, so refusing the mismatch costs nothing. Requests with no
// Origin (curl, server-to-server) pass through — they're covered by the rate
// limits, not by this check.
export function rejectCrossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    // Malformed Origin: fall through and refuse.
  }
  return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
}
