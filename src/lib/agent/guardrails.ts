import { computeExpectedDecision } from "./rules";

export interface ProposedDecision {
  decision: "refund" | "deny";
  refundAmount: number;
  reason: string;
}

export interface CustomerFacts {
  lastActiveAt: string | null;
  transactionAmount: number;
  transactionOccurredAt: string;
}

export type GuardrailResult =
  | {
      allowed: true;
      finalAmount: number;
      flags: string[];
      expected: ReturnType<typeof computeExpectedDecision>;
    }
  | {
      allowed: false;
      reason: string;
      expected: ReturnType<typeof computeExpectedDecision>;
    };

// Re-derives the correct decision from real account data — independent of
// whatever the model reasoned about — and checks the model's proposal
// against it. This is what actually stops a manipulated model output from
// becoming a real refund; the system prompt's instructions are a second
// layer, not the only one.
export function validateDecision(
  proposed: ProposedDecision,
  facts: CustomerFacts,
): GuardrailResult {
  const expected = computeExpectedDecision(facts);

  if (!Number.isFinite(proposed.refundAmount) || proposed.refundAmount < 0) {
    return { allowed: false, reason: "refundAmount is not a valid non-negative number.", expected };
  }

  if (proposed.decision === "deny") {
    if (proposed.refundAmount !== 0) {
      return { allowed: false, reason: "A denial must carry a refundAmount of 0.", expected };
    }
    // Denying is never a financial risk. If policy actually says refund,
    // that's a missed refund a human will catch on review, not blocked here.
    const flags = expected.decision === "refund" ? ["rule_mismatch_conservative"] : [];
    return { allowed: true, finalAmount: 0, flags, expected };
  }

  // decision === "refund": the financially risky path, checked hard.
  if (expected.decision !== "refund") {
    return {
      allowed: false,
      reason: `Policy does not support a refund for this customer (${expected.reasoning}), but the agent proposed one.`,
      expected,
    };
  }

  if (proposed.refundAmount > expected.maxRefundAmount) {
    return {
      allowed: false,
      reason: `Proposed refund of ${proposed.refundAmount} exceeds the customer's actual payment of ${expected.maxRefundAmount}.`,
      expected,
    };
  }

  return { allowed: true, finalAmount: proposed.refundAmount, flags: [], expected };
}
