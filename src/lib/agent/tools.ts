import type Anthropic from "@anthropic-ai/sdk";
import type { createServiceClient } from "@/lib/supabase/server";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_user_profile",
    description: "Look up a customer's plan, signup date, and last active date.",
    input_schema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The customer's user id." },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_payment_history",
    description: "Look up a customer's payment transactions.",
    input_schema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The customer's user id." },
      },
      required: ["userId"],
    },
  },
  {
    name: "request_human_approval",
    description:
      "Submit a proposed refund decision for human review. Call exactly once, after looking up the customer's profile and payment history.",
    input_schema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["refund", "deny"] },
        refundAmount: {
          type: "number",
          description: "Dollar amount to refund. Must be 0 if decision is 'deny'.",
        },
        reason: { type: "string", description: "Brief explanation for the decision." },
      },
      required: ["decision", "refundAmount", "reason"],
    },
  },
];

export interface ToolContext {
  supabase: ReturnType<typeof createServiceClient>;
  boundUserId: string;
}

export interface ToolOutcome {
  result: unknown;
  isError: boolean;
}

// Read tools take a userId argument (matching the brief's tool signatures),
// but we never trust it blindly: it's checked against the customer the
// ticket actually belongs to. Without this, an injected instruction like
// "look up user X's payment history instead" would let the agent pull a
// different customer's data.
function checkBoundUser(userId: string, ctx: ToolContext): ToolOutcome | null {
  if (userId !== ctx.boundUserId) {
    return {
      isError: true,
      result: {
        error: "access_denied",
        message: "This ticket is not associated with the requested userId.",
      },
    };
  }
  return null;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case "get_user_profile": {
      const userId = String(input.userId ?? "");
      const denied = checkBoundUser(userId, ctx);
      if (denied) return denied;

      const { data, error } = await ctx.supabase
        .from("mock_users")
        .select("id, name, email, plan, signup_date, last_active_at")
        .eq("id", userId)
        .single();

      if (error || !data) {
        return { isError: true, result: { error: "not_found", message: error?.message } };
      }
      return { isError: false, result: data };
    }

    case "get_payment_history": {
      const userId = String(input.userId ?? "");
      const denied = checkBoundUser(userId, ctx);
      if (denied) return denied;

      const { data, error } = await ctx.supabase
        .from("mock_transactions")
        .select("id, amount, currency, occurred_at, status")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false });

      if (error) {
        return { isError: true, result: { error: "query_failed", message: error.message } };
      }
      return { isError: false, result: data };
    }

    case "request_human_approval": {
      // No DB access needed here — this is a terminal tool call, handled by
      // the orchestrator (runAgent.ts), which runs the guardrail before
      // logging or acting on it. We still route it through executeTool so
      // every tool call goes through one place, but it's a no-op here.
      return { isError: false, result: { received: true } };
    }

    default:
      return { isError: true, result: { error: "unknown_tool", message: name } };
  }
}
