"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TicketActionRow, TicketRow } from "@/lib/tickets";

function formatMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

async function postJSON(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export function DecisionPanel({
  ticket,
  actions,
  maxRefund,
}: {
  ticket: TicketRow;
  actions: TicketActionRow[];
  maxRefund: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModify, setShowModify] = useState(false);
  const [modifyDecision, setModifyDecision] = useState<"refund" | "deny">("deny");
  const [modifyAmount, setModifyAmount] = useState("0");
  const [modifyNote, setModifyNote] = useState("");

  async function run(action: () => Promise<unknown>) {
    setLoading(true);
    setError(null);
    try {
      await action();
      router.refresh();
      setShowModify(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const latest = actions[actions.length - 1];

  const ModifyForm = showModify ? (
    <div className="mt-4 space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Set the decision yourself:</p>
      <div className="flex gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            checked={modifyDecision === "refund"}
            onChange={() => setModifyDecision("refund")}
          />
          Refund
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            checked={modifyDecision === "deny"}
            onChange={() => {
              setModifyDecision("deny");
              setModifyAmount("0");
            }}
          />
          Deny
        </label>
      </div>
      {modifyDecision === "refund" && (
        <div className="text-sm">
          <label className="mb-1 block text-muted-foreground">
            Amount {maxRefund !== null && `(customer paid ${formatMoney(maxRefund)})`}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={maxRefund ?? undefined}
            value={modifyAmount}
            onChange={(e) => setModifyAmount(e.target.value)}
            className="w-32 rounded-md border px-2 py-1"
          />
        </div>
      )}
      <div className="text-sm">
        <label className="mb-1 block text-muted-foreground">Note (optional)</label>
        <input
          value={modifyNote}
          onChange={(e) => setModifyNote(e.target.value)}
          className="w-full rounded-md border px-2 py-1"
          placeholder="Why you're overriding the agent"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={loading}
          onClick={() =>
            run(() =>
              postJSON(`/api/tickets/${ticket.id}/decide`, {
                action: "modify",
                decision: modifyDecision,
                refundAmount: modifyDecision === "refund" ? Number(modifyAmount) : 0,
                note: modifyNote || undefined,
              }),
            )
          }
        >
          Submit override
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowModify(false)}>
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  const ErrorBanner = error ? (
    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  ) : null;

  if (ticket.status === "new") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ready to analyze</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-base text-muted-foreground">
            The agent hasn&apos;t looked at this ticket yet.
          </p>
          <Button disabled={loading} onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/analyze`))}>
            {loading ? "Analyzing…" : "Analyze ticket"}
          </Button>
          {ErrorBanner}
        </CardContent>
      </Card>
    );
  }

  if (ticket.status === "analyzing") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analysis in progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-base text-muted-foreground">
            This ticket started analysis but hasn&apos;t reached a decision — normal if a run is active in
            another tab, or if a previous run was interrupted. Resuming re-runs the tool-calling loop; every
            prior step stays in the log below.
          </p>
          <Button disabled={loading} onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/analyze`))}>
            {loading ? "Analyzing…" : "Resume analysis"}
          </Button>
          {ErrorBanner}
        </CardContent>
      </Card>
    );
  }

  if (ticket.status === "rejected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rejected</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">A human rejected this ticket. No refund was issued.</p>
        </CardContent>
      </Card>
    );
  }

  if (ticket.status === "completed") {
    const executed = [...actions].reverse().find((a) => a.action_type === "mock_refund_executed");
    const wasAutoApproved = actions.some((a) => a.action_type === "auto_approved");
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Completed</CardTitle>
        </CardHeader>
        <CardContent>
          {wasAutoApproved && (
            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              ⚡ Auto-approved — under the threshold, no human clicked anything
            </p>
          )}
          <p className="text-base text-muted-foreground">
            {executed
              ? `Refund of ${formatMoney(Number((executed.payload as { amount: number }).amount))} executed (mock).`
              : "Resolved as a denial — no refund issued."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // awaiting_approval
  if (latest?.action_type === "decision_proposed") {
    const p = latest.payload as { decision: "refund" | "deny"; refundAmount: number; reason: string };
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Proposed: {p.decision === "refund" ? `Refund ${formatMoney(p.refundAmount)}` : "Deny"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            ✅ This proposal passed the guardrail check
          </p>
          <p className="mb-4 text-base text-muted-foreground">{p.reason}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loading}
              onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/decide`, { action: "approve" }))}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/decide`, { action: "reject" }))}
            >
              Reject
            </Button>
            <Button variant="ghost" disabled={loading} onClick={() => setShowModify((v) => !v)}>
              Override decision
            </Button>
          </div>
          {ModifyForm}
          {ErrorBanner}
        </CardContent>
      </Card>
    );
  }

  if (latest?.action_type === "guardrail_blocked") {
    const p = latest.payload as { reason: string };
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-lg">🛡 Guardrail blocked this ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-1 text-xs font-medium text-red-700 dark:text-red-400">
            ✕ The agent DID propose a decision here, but it failed the guardrail check — that&apos;s why
            there&apos;s no Approve button
          </p>
          <p className="mb-4 text-base text-muted-foreground">{p.reason}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/decide`, { action: "reject" }))}
            >
              Reject
            </Button>
            <Button variant="ghost" disabled={loading} onClick={() => setShowModify((v) => !v)}>
              Override decision
            </Button>
          </div>
          {ModifyForm}
          {ErrorBanner}
        </CardContent>
      </Card>
    );
  }

  // agent_incomplete or any other terminal-ish state while awaiting_approval
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Needs manual review</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-base text-muted-foreground">
          The agent didn&apos;t submit a proposal for this ticket. Review the log below and decide manually.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => run(() => postJSON(`/api/tickets/${ticket.id}/decide`, { action: "reject" }))}
          >
            Reject
          </Button>
          <Button variant="ghost" disabled={loading} onClick={() => setShowModify((v) => !v)}>
            Override decision
          </Button>
        </div>
        {ModifyForm}
        {ErrorBanner}
      </CardContent>
    </Card>
  );
}
