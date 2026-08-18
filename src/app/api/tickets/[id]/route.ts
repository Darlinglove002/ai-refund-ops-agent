import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: ticket, error: ticketError }, { data: actions, error: actionsError }] =
    await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase
        .from("ticket_actions")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (ticketError || !ticket) {
    return NextResponse.json({ error: ticketError?.message ?? "Ticket not found" }, { status: 404 });
  }
  if (actionsError) {
    return NextResponse.json({ error: actionsError.message }, { status: 500 });
  }

  let customer = null;
  if (ticket.user_id) {
    const { data } = await supabase
      .from("mock_users")
      .select("id, name, email, plan, signup_date, last_active_at")
      .eq("id", ticket.user_id)
      .single();
    customer = data;
  }

  return NextResponse.json({ ticket, actions, customer });
}
