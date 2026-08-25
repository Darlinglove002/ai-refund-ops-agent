// The single source of truth for the refund policy. Both the system prompt
// (src/lib/agent/prompt.ts) and the code-level guardrail (src/lib/agent/
// guardrails.ts) derive from this function, so the model's instructions and
// the hard check it's measured against can never drift apart.

export const REFUND_WINDOW_DAYS = 14;

// Refunds at or under this amount execute automatically once they've
// cleared the guardrail — no human in the loop for them. This is a purely
// operational threshold: it never overrides or bypasses the guardrail
// check itself, it only decides who has to click the button on a proposal
// that already passed. Anything above it, and every denial regardless of
// amount, still goes to a human.
export const AUTO_APPROVE_MAX_AMOUNT = 20;

export interface RuleInput {
  lastActiveAt: string | null;
  transactionAmount: number;
  transactionOccurredAt: string;
  now?: Date;
}

export interface RuleResult {
  decision: "refund" | "deny";
  maxRefundAmount: number;
  reasoning: string;
}

export function computeExpectedDecision(input: RuleInput): RuleResult {
  const now = input.now ?? new Date();
  const paymentDate = new Date(input.transactionOccurredAt);
  const daysSincePayment = (now.getTime() - paymentDate.getTime()) / 86_400_000;
  const hadActivitySincePayment =
    input.lastActiveAt !== null &&
    new Date(input.lastActiveAt).getTime() >= paymentDate.getTime();

  if (daysSincePayment < REFUND_WINDOW_DAYS && !hadActivitySincePayment) {
    return {
      decision: "refund",
      maxRefundAmount: input.transactionAmount,
      reasoning: `Payment was ${daysSincePayment.toFixed(1)} days ago (under the ${REFUND_WINDOW_DAYS}-day window) with no account activity since.`,
    };
  }

  const reasoning =
    daysSincePayment >= REFUND_WINDOW_DAYS
      ? `Payment was ${daysSincePayment.toFixed(1)} days ago, past the ${REFUND_WINDOW_DAYS}-day window.`
      : `Customer was active after paying (last active ${input.lastActiveAt}).`;

  return { decision: "deny", maxRefundAmount: 0, reasoning };
}
