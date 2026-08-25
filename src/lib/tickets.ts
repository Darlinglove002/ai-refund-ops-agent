import { createServiceClient } from "@/lib/supabase/server";
import type { Database, TicketStatus } from "@/lib/supabase/types";

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

export interface DashboardStats {
  totalTickets: number;
  byStatus: Record<TicketStatus, number>;
  autoApprovedCount: number;
  humanApprovedCount: number;
  humanRejectedCount: number;
  guardrailBlockedCount: number;
  refundCount: number;
  totalRefunded: number;
  feedbackGoodCount: number;
  feedbackBadCount: number;
}

const EMPTY_STATUS_COUNTS: Record<TicketStatus, number> = {
  new: 0,
  analyzing: 0,
  awaiting_approval: 0,
  approved: 0,
  rejected: 0,
  completed: 0,
};

// Aggregated client-side over every ticket_actions row — fine at this
// project's scale (a demo with dozens of tickets, not a production
// analytics workload). A real deployment would push this into a SQL view.
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = createServiceClient();
  const [{ data: tickets }, { data: actions }] = await Promise.all([
    supabase.from("tickets").select("status"),
    supabase.from("ticket_actions").select("action_type, payload"),
  ]);

  const byStatus = { ...EMPTY_STATUS_COUNTS };
  for (const t of tickets ?? []) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }

  let autoApprovedCount = 0;
  let humanApprovedCount = 0;
  let humanRejectedCount = 0;
  let guardrailBlockedCount = 0;
  let refundCount = 0;
  let totalRefunded = 0;
  let feedbackGoodCount = 0;
  let feedbackBadCount = 0;

  for (const a of actions ?? []) {
    switch (a.action_type) {
      case "auto_approved":
        autoApprovedCount++;
        break;
      case "human_approved":
        humanApprovedCount++;
        break;
      case "human_rejected":
        humanRejectedCount++;
        break;
      case "guardrail_blocked":
        guardrailBlockedCount++;
        break;
      case "mock_refund_executed":
        refundCount++;
        totalRefunded += Number((a.payload as { amount?: number }).amount ?? 0);
        break;
      case "human_feedback":
        if ((a.payload as { rating?: string }).rating === "good") feedbackGoodCount++;
        else feedbackBadCount++;
        break;
    }
  }

  return {
    totalTickets: tickets?.length ?? 0,
    byStatus,
    autoApprovedCount,
    humanApprovedCount,
    humanRejectedCount,
    guardrailBlockedCount,
    refundCount,
    totalRefunded,
    feedbackGoodCount,
    feedbackBadCount,
  };
}
