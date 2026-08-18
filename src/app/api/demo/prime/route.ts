import { NextResponse } from "next/server";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import { createServiceClient } from "@/lib/supabase/server";
import { runAgentForTicket } from "@/lib/agent/runAgent";

// Pre-runs the agent on the fixed demo-scenario tickets so the Demo Mode
// bar is instant during an actual walkthrough — nobody wants to sit through
// a live 10-15s LLM call while presenting. Run this once before a demo.
export async function POST() {
  const supabase = createServiceClient();
  const emails = DEMO_SCENARIOS.map((s) => s.email);

  const { data: users } = await supabase.from("mock_users").select("id, email").in("email", emails);
  const userIds = (users ?? []).map((u) => u.id);

  const { data: tickets } = userIds.length
    ? await supabase.from("tickets").select("id, status").in("user_id", userIds)
    : { data: [] as { id: string; status: string }[] };

  const results: { ticketId: string; ok: boolean; error?: string }[] = [];

  for (const ticket of tickets ?? []) {
    if (ticket.status !== "new" && ticket.status !== "analyzing") continue;
    try {
      await runAgentForTicket(ticket.id);
      results.push({ ticketId: ticket.id, ok: true });
    } catch (err) {
      results.push({ ticketId: ticket.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ primed: results });
}
