import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import { validateDecision, type ProposedDecision } from "./guardrails";
import { logAction } from "./log";

const MODEL = "claude-sonnet-5";
const MAX_TOOL_TURNS = 6;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export class AgentRunError extends Error {}

// Runs the agent loop for one ticket to completion: gathers data via tools,
// proposes a decision, guardrail-checks it, and logs every step to
// ticket_actions. Every step is persisted before the next one runs, so if
// the process crashes or restarts mid-run, the ticket's ticket_actions log
// (and its `status`) fully describe what happened — nothing lives only in
// memory. Returns nothing; callers should re-read the ticket + actions from
// the DB afterward.
export async function runAgentForTicket(ticketId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, user_id, customer_message, status")
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) {
    throw new AgentRunError(`Ticket ${ticketId} not found: ${ticketError?.message}`);
  }
  if (!ticket.user_id) {
    throw new AgentRunError(`Ticket ${ticketId} has no associated user_id.`);
  }
  if (ticket.status !== "new" && ticket.status !== "analyzing") {
    throw new AgentRunError(
      `Ticket ${ticketId} is already ${ticket.status}; refusing to re-run the agent on it.`,
    );
  }

  const boundUserId = ticket.user_id;

  if (ticket.status === "new") {
    await supabase.from("tickets").update({ status: "analyzing" }).eq("id", ticketId);
    await logAction(supabase, ticketId, "analysis_started", {});
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `customer_id: ${boundUserId}\n\n<customer_message>\n${ticket.customer_message}\n</customer_message>`,
    },
  ];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      await logAction(supabase, ticketId, "agent_incomplete", {
        reason: "Model responded without calling request_human_approval.",
        text,
      });
      await supabase.from("tickets").update({ status: "awaiting_approval" }).eq("id", ticketId);
      return;
    }

    const approvalBlock = toolUseBlocks.find((b) => b.name === "request_human_approval");
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.name === "request_human_approval") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ received: true }),
        });
        continue;
      }

      const input = block.input as Record<string, unknown>;
      await logAction(supabase, ticketId, "tool_call", { name: block.name, input });

      const outcome = await executeTool(block.name, input, { supabase, boundUserId });
      await logAction(supabase, ticketId, "tool_result", {
        name: block.name,
        output: outcome.result,
        isError: outcome.isError,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(outcome.result),
        is_error: outcome.isError,
      });
    }

    if (approvalBlock) {
      const proposed = approvalBlock.input as unknown as ProposedDecision;
      await logAction(supabase, ticketId, "decision_requested", { proposed });
      await finalizeDecision(supabase, ticketId, boundUserId, proposed);
      return;
    }

    messages.push({ role: "user", content: toolResults });
  }

  await logAction(supabase, ticketId, "agent_incomplete", {
    reason: `Exceeded ${MAX_TOOL_TURNS} tool-call turns without a decision.`,
  });
  await supabase.from("tickets").update({ status: "awaiting_approval" }).eq("id", ticketId);
}

async function finalizeDecision(
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string,
  userId: string,
  proposed: ProposedDecision,
) {
  const [{ data: user }, { data: txn }] = await Promise.all([
    supabase.from("mock_users").select("last_active_at").eq("id", userId).single(),
    supabase
      .from("mock_transactions")
      .select("amount, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (!user || !txn) {
    await logAction(supabase, ticketId, "guardrail_blocked", {
      proposed,
      reason: "Could not load ground-truth customer facts to validate the decision against.",
    });
    await supabase.from("tickets").update({ status: "awaiting_approval" }).eq("id", ticketId);
    return;
  }

  const guardrail = validateDecision(proposed, {
    lastActiveAt: user.last_active_at,
    transactionAmount: Number(txn.amount),
    transactionOccurredAt: txn.occurred_at,
  });

  if (!guardrail.allowed) {
    await logAction(supabase, ticketId, "guardrail_blocked", {
      proposed,
      reason: guardrail.reason,
      expected: guardrail.expected,
    });
  } else {
    await logAction(supabase, ticketId, "decision_proposed", {
      decision: proposed.decision,
      refundAmount: guardrail.finalAmount,
      reason: proposed.reason,
      flags: guardrail.flags,
    });
  }

  await supabase.from("tickets").update({ status: "awaiting_approval" }).eq("id", ticketId);
}
