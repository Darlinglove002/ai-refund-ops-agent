import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAgentForTicket, AgentRunError } from "@/lib/agent/runAgent";
import { guardBilledCall } from "@/lib/rateLimit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const blocked = await guardBilledCall(request, "analyze");
  if (blocked) return blocked;

  try {
    await runAgentForTicket(id);
  } catch (err) {
    if (err instanceof AgentRunError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error running agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const supabase = createServiceClient();
  const [{ data: ticket }, { data: actions }] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", id).single(),
    supabase
      .from("ticket_actions")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({ ticket, actions });
}
