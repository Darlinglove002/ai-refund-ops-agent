import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/agent/log";

const feedbackBodySchema = z.object({
  rating: z.enum(["good", "bad"]),
  note: z.string().max(500).optional(),
});

// A minimal human-feedback loop: once a ticket is resolved, a reviewer can
// mark whether the agent's original reasoning held up. This doesn't retrain
// anything by itself — it's the raw material (ticket -> agent's reasoning ->
// a human's verdict on it) that a real feedback/eval pipeline would be
// built from.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rawBody = await request.json().catch(() => null);
  const parsed = feedbackBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

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
