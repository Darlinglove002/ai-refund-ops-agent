import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/agent/log";
import { mockIssueRefund } from "@/lib/agent/mockStripe";

// Never trust a request body just because TypeScript says it has a shape —
// that's a compile-time claim about our own code, not a guarantee about
// what actually arrived over the network. Parsed and rejected at runtime.
const decideBodySchema = z.object({
  action: z.enum(["approve", "reject", "modify"]),
  decision: z.enum(["refund", "deny"]).optional(),
  refundAmount: z.number().finite().min(0).optional(),
  note: z.string().max(500).optional(),
});

// Atomically transitions the ticket out of "awaiting_approval" — the WHERE
// clause on status means only one of two concurrent requests (e.g. two
// support reps opening the same ticket) can ever win this update. Without
// it, both requests would read status="awaiting_approval", both pass the
// check, and both execute a refund.
async function claimTicket(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  targetStatus: "rejected" | "completed",
): Promise<boolean> {
  const { data } = await supabase
    .from("tickets")
    .update({ status: targetStatus })
    .eq("id", id)
    .eq("status", "awaiting_approval")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

const ALREADY_RESOLVED = NextResponse.json(
  { error: "This ticket was already resolved by another request (or another tab)." },
  { status: 409 },
);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rawBody = await request.json().catch(() => null);
  const parsed = decideBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = createServiceClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, user_id, status")
    .eq("id", id)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Ticket is ${ticket.status}, not awaiting approval.` },
      { status: 409 },
    );
  }
  if (!ticket.user_id) {
    return NextResponse.json({ error: "Ticket has no associated customer." }, { status: 409 });
  }

  if (body.action === "reject") {
    if (!(await claimTicket(supabase, id, "rejected"))) return ALREADY_RESOLVED;
    await logAction(supabase, id, "human_rejected", { note: body.note ?? null });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    const { data: lastAction } = await supabase
      .from("ticket_actions")
      .select("action_type, payload")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastAction || lastAction.action_type !== "decision_proposed") {
      return NextResponse.json(
        {
          error:
            "No approvable proposal on this ticket (it may have been guardrail-blocked). Use 'modify' to set a decision manually.",
        },
        { status: 409 },
      );
    }

    if (!(await claimTicket(supabase, id, "completed"))) return ALREADY_RESOLVED;

    const proposal = lastAction.payload as { decision: "refund" | "deny"; refundAmount: number };
    await logAction(supabase, id, "human_approved", { proposal });
    await executeIfRefund(supabase, id, proposal.decision, proposal.refundAmount);
    return NextResponse.json({ ok: true });
  }

  // action === "modify": a human can override the agent's proposal (or a
  // guardrail-blocked one) using their own judgment — including granting an
  // exception the policy wouldn't. The one thing that stays non-negotiable
  // is the financial hard cap below: a refund can never exceed what the
  // customer actually paid, no matter who signs off on it.
  if (!body.decision || typeof body.refundAmount !== "number") {
    return NextResponse.json({ error: "modify requires decision and refundAmount." }, { status: 400 });
  }

  const { data: txn } = await supabase
    .from("mock_transactions")
    .select("amount")
    .eq("user_id", ticket.user_id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .single();

  if (!txn) {
    return NextResponse.json({ error: "Could not load customer's payment to validate against." }, { status: 500 });
  }

  if (body.decision === "deny") {
    if (body.refundAmount !== 0) {
      return NextResponse.json({ error: "A denial must carry a refundAmount of 0." }, { status: 400 });
    }
  } else if (body.refundAmount <= 0 || body.refundAmount > Number(txn.amount)) {
    return NextResponse.json(
      { error: `refundAmount must be between 0 and the customer's actual payment (${txn.amount}).` },
      { status: 400 },
    );
  }

  if (!(await claimTicket(supabase, id, "completed"))) return ALREADY_RESOLVED;

  await logAction(supabase, id, "human_modified", {
    decision: body.decision,
    refundAmount: body.refundAmount,
    note: body.note ?? null,
  });
  await executeIfRefund(supabase, id, body.decision, body.refundAmount);
  return NextResponse.json({ ok: true });
}

async function executeIfRefund(
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string,
  decision: "refund" | "deny",
  refundAmount: number,
) {
  if (decision === "refund" && refundAmount > 0) {
    const charge = await mockIssueRefund(refundAmount);
    await logAction(supabase, ticketId, "mock_refund_executed", charge);
  }
}
