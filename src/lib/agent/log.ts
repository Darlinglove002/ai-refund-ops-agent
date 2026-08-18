import type { createServiceClient } from "@/lib/supabase/serviceClient";

export async function logAction(
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string,
  actionType: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from("ticket_actions")
    .insert({ ticket_id: ticketId, action_type: actionType, payload });
  if (error) {
    throw new Error(`Failed to log action ${actionType} for ticket ${ticketId}: ${error.message}`);
  }
}
