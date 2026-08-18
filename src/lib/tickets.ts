import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type TicketRow = Database["public"]["Tables"]["tickets"]["Row"];
export type TicketActionRow = Database["public"]["Tables"]["ticket_actions"]["Row"];
export type CustomerRow = Database["public"]["Tables"]["mock_users"]["Row"];

export interface TicketListItem extends TicketRow {
  customerName: string | null;
}

export async function listTickets(): Promise<TicketListItem[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const userIds = [...new Set(data.map((t) => t.user_id).filter((v): v is string => Boolean(v)))];
  const { data: users } = userIds.length
    ? await supabase.from("mock_users").select("id, name").in("id", userIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  return data.map((t) => ({ ...t, customerName: t.user_id ? (nameById.get(t.user_id) ?? null) : null }));
}

export interface TicketDetail {
  ticket: TicketRow;
  actions: TicketActionRow[];
  customer: Pick<CustomerRow, "id" | "name" | "email" | "plan" | "signup_date" | "last_active_at"> | null;
  latestTransactionAmount: number | null;
}

export async function getTicketDetail(id: string): Promise<TicketDetail | null> {
  const supabase = createServiceClient();
  const [{ data: ticket }, { data: actions }] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", id).single(),
    supabase
      .from("ticket_actions")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ticket) return null;

  let customer: TicketDetail["customer"] = null;
  let latestTransactionAmount: number | null = null;
  if (ticket.user_id) {
    const [{ data: user }, { data: txn }] = await Promise.all([
      supabase
        .from("mock_users")
        .select("id, name, email, plan, signup_date, last_active_at")
        .eq("id", ticket.user_id)
        .single(),
      supabase
        .from("mock_transactions")
        .select("amount")
        .eq("user_id", ticket.user_id)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .single(),
    ]);
    customer = user;
    latestTransactionAmount = txn ? Number(txn.amount) : null;
  }

  return { ticket, actions: actions ?? [], customer, latestTransactionAmount };
}
