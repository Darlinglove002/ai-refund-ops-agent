import type { TicketActionRow } from "@/lib/tickets";
import { cn } from "@/lib/utils";

function formatMoney(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : String(n);
}

function describe(action: TicketActionRow): { icon: string; title: string; detail?: string; tone?: "warn" | "block" | "ok" } {
  const p = action.payload as Record<string, unknown>;

  switch (action.action_type) {
    case "analysis_started":
      return { icon: "▶", title: "Analysis started" };

    case "tool_call": {
      const input = p.input as Record<string, unknown> | undefined;
      return {
        icon: "→",
        title: `Called ${String(p.name)}`,
        detail: input ? JSON.stringify(input) : undefined,
      };
    }

    case "tool_result": {
      const isError = Boolean(p.isError);
      return {
        icon: isError ? "✕" : "←",
        title: `${String(p.name)} ${isError ? "failed" : "returned"}`,
        detail: JSON.stringify(p.output),
        tone: isError ? "warn" : undefined,
      };
    }

    case "decision_requested": {
      const proposed = p.proposed as { decision: string; refundAmount: number; reason: string };
      return {
        icon: "🤖",
        title: `Agent's raw proposal: ${proposed.decision}${proposed.decision === "refund" ? ` ${formatMoney(proposed.refundAmount)}` : ""}`,
        detail: proposed.reason,
      };
    }

    case "decision_proposed": {
      const flags = (p.flags as string[] | undefined) ?? [];
      return {
        icon: "✅",
        title: `Guardrail cleared: ${p.decision}${p.decision === "refund" ? ` ${formatMoney(p.refundAmount)}` : ""}`,
        detail: [String(p.reason), flags.length ? `flags: ${flags.join(", ")}` : null].filter(Boolean).join(" — "),
        tone: flags.length ? "warn" : "ok",
      };
    }

    case "guardrail_blocked":
      return {
        icon: "🛡",
        title: "Guardrail blocked the proposal",
        detail: String(p.reason),
        tone: "block",
      };

    case "agent_incomplete":
      return {
        icon: "⚠",
        title: "Agent did not reach a decision",
        detail: (p.text as string) || (p.reason as string),
        tone: "warn",
      };

    case "human_approved":
      return { icon: "👤", title: "Human approved the proposed decision", tone: "ok" };

    case "human_rejected":
      return {
        icon: "👤",
        title: "Human rejected the ticket",
        detail: (p.note as string) || undefined,
        tone: "block",
      };

    case "human_modified": {
      return {
        icon: "👤",
        title: `Human overrode the decision: ${p.decision}${p.decision === "refund" ? ` ${formatMoney(p.refundAmount)}` : ""}`,
        detail: (p.note as string) || undefined,
      };
    }

    case "mock_refund_executed":
      return {
        icon: "💳",
        title: `Mock refund executed: ${formatMoney(p.amount)}`,
        detail: `charge ${String(p.mockChargeId)}`,
        tone: "ok",
      };

    default:
      return { icon: "•", title: action.action_type, detail: JSON.stringify(p) };
  }
}

export function ReasoningFeed({ actions }: { actions: TicketActionRow[] }) {
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {actions.map((action) => {
        const { icon, title, detail, tone } = describe(action);
        return (
          <li key={action.id} className="flex gap-3 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                tone === "block" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                !tone && "bg-muted text-muted-foreground",
              )}
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{title}</p>
              {detail && <p className="mt-0.5 break-words text-muted-foreground">{detail}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                {new Date(action.created_at).toLocaleTimeString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
