import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/agent/log";

interface FeedbackBody {
  rating: "good" | "bad";
  note?: string;
}

// A minimal human-feedback loop: once a ticket is resolved, a reviewer can
// mark whether the agent's original reasoning held up. This doesn't retrain
// anything by itself — it's the raw material (ticket -> agent's reasoning ->
// a human's verdict on it) that a real feedback/eval pipeline would be
// built from.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as FeedbackBody;

  if (body.rating !== "good" && body.rating !== "bad") {
    return NextResponse.json({ error: "rating must be 'good' or 'bad'." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: ticket } = await supabase.from("tickets").select("status").eq("id", id).single();
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.status !== "completed" && ticket.status !== "rejected") {
    return NextResponse.json({ error: "Feedback is only for resolved tickets." }, { status: 409 });
  }

  const { data: existing } = await supabase
    .from("ticket_actions")
    .select("id")
    .eq("ticket_id", id)
    .eq("action_type", "human_feedback")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Feedback was already recorded for this ticket." }, { status: 409 });
  }

  await logAction(supabase, id, "human_feedback", { rating: body.rating, note: body.note ?? null });
  return NextResponse.json({ ok: true });
}
