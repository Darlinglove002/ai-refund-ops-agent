import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAgentForTicket, AgentRunError } from "@/lib/agent/runAgent";
import { guardBilledCall } from "@/lib/rateLimit";
import { rejectCrossOrigin } from "@/lib/requestGuards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const blocked = await guardBilledCall(request, "analyze");
  if (blocked) return blocked;

  try {
    await runAgentForTicket(id);
  } catch (err) {
    if (err instanceof AgentRunError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Raw SDK/database errors can carry request ids, key hints and table
    // names — log them server-side, show the visitor something generic.
    console.error("agent run failed:", err);
    return NextResponse.json({ error: "The analysis failed. Please try again in a moment." }, { status: 500 });
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
