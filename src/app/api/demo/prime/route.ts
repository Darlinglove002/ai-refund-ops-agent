import { NextResponse } from "next/server";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import { createServiceClient } from "@/lib/supabase/server";
import { runAgentForTicket } from "@/lib/agent/runAgent";
import { guardBilledCall } from "@/lib/rateLimit";
import { rejectCrossOrigin } from "@/lib/requestGuards";

// Pre-runs the agent on the fixed demo-scenario tickets so the Demo Mode
// bar is instant during an actual walkthrough — nobody wants to sit through
// a live 10-15s LLM call while presenting. Run this once before a demo.
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const supabase = createServiceClient();
  const emails = DEMO_SCENARIOS.map((s) => s.email);

  const { data: users } = await supabase.from("mock_users").select("id, email").in("email", emails);
  const userIds = (users ?? []).map((u) => u.id);

  const { data: tickets } = userIds.length
    ? await supabase.from("tickets").select("id, status").in("user_id", userIds)
    : { data: [] as { id: string; status: string }[] };

  const pending = (tickets ?? []).filter((t) => t.status === "new" || t.status === "analyzing");
  if (pending.length === 0) return NextResponse.json({ primed: [] });

  // Each pending ticket is one billed agent run, so charge the budget for all
  // of them up front rather than after the money is spent.
  const blocked = await guardBilledCall(request, "prime", pending.length);
  if (blocked) return blocked;

  const results: { ticketId: string; ok: boolean; error?: string }[] = [];

  for (const ticket of pending) {
    try {
      await runAgentForTicket(ticket.id);
      results.push({ ticketId: ticket.id, ok: true });
    } catch (err) {
      console.error("prime failed for ticket", ticket.id, err);
      results.push({ ticketId: ticket.id, ok: false, error: "analysis failed" });
    }
  }

  return NextResponse.json({ primed: results });
}
