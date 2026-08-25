import type { TicketActionRow } from "@/lib/tickets";
import { cn } from "@/lib/utils";

function formatMoney(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : String(n);
}

function formatDate(iso: unknown) {
  const d = new Date(String(iso));
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString();
}

// Turns a tool's raw JSON output into a plain-English sentence, so the
// activity log reads like a summary of what the agent found rather than a
// dump of API payloads.
function describeToolResult(name: string, output: unknown): string {
  const o = output as Record<string, unknown> | unknown[] | null;

  if (o && typeof o === "object" && "error" in o) {
    return `Couldn't complete this lookup: ${String((o as Record<string, unknown>).message ?? o.error)}`;
  }

  if (name === "get_user_profile" && o && typeof o === "object" && !Array.isArray(o)) {
    const u = o as Record<string, unknown>;
    const lastActive = u.last_active_at ? formatDate(u.last_active_at) : "never";
    return `${u.name} — ${u.plan} plan, signed up ${formatDate(u.signup_date)}, last active ${lastActive}`;
  }

  if (name === "get_payment_history" && Array.isArray(o)) {
    if (o.length === 0) return "No payments on file.";
    return o
      .map((t) => {
        const txn = t as Record<string, unknown>;
        return `${formatMoney(txn.amount)} on ${formatDate(txn.occurred_at)} (${txn.status})`;
      })
      .join("; ");
  }

  return JSON.stringify(o);
}

function toolLabel(name: string): string {
  if (name === "get_user_profile") return "Looked up customer profile";
  if (name === "get_payment_history") return "Looked up payment history";
  return `Called ${name}`;
}

interface DisplayItem {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  tone?: "warn" | "block" | "ok";
  createdAt: string;
}

// Merges each tool_call with the tool_result right after it into one line —
// the raw pair is still in the database for anyone who wants to inspect it
// (e.g. via the API), this is just how it's presented here.
function buildDisplayItems(actions: TicketActionRow[]): DisplayItem[] {
  const items: DisplayItem[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const p = action.payload as Record<string, unknown>;

    if (action.action_type === "tool_call") {
      const next = actions[i + 1];
      const name = String(p.name);
      if (next?.action_type === "tool_result") {
        const np = next.payload as Record<string, unknown>;
        const isError = Boolean(np.isError);
        items.push({
          id: action.id,
          icon: isError ? "✕" : "→",
          title: toolLabel(name),
          detail: describeToolResult(name, np.output),
          tone: isError ? "warn" : undefined,
          createdAt: next.created_at,
        });
        i++; // skip the paired tool_result
        continue;
      }
      items.push({ id: action.id, icon: "→", title: toolLabel(name), createdAt: action.created_at });
      continue;
    }

    switch (action.action_type) {
      case "analysis_started":
        items.push({ id: action.id, icon: "▶", title: "Analysis started", createdAt: action.created_at });
        break;

      case "decision_requested": {
        const proposed = p.proposed as { decision: string; refundAmount: number; reason: string };
        items.push({
          id: action.id,
          icon: "🤖",
          title: `Agent's raw proposal: ${proposed.decision}${proposed.decision === "refund" ? ` ${formatMoney(proposed.refundAmount)}` : ""}`,
          detail: proposed.reason,
          createdAt: action.created_at,
        });
        break;
      }

      case "decision_proposed": {
        const flags = (p.flags as string[] | undefined) ?? [];
        items.push({
          id: action.id,
          icon: "✅",
          title: `Guardrail cleared: ${p.decision}${p.decision === "refund" ? ` ${formatMoney(p.refundAmount)}` : ""}`,
          detail: [String(p.reason), flags.length ? `flags: ${flags.join(", ")}` : null].filter(Boolean).join(" — "),
          tone: flags.length ? "warn" : "ok",
          createdAt: action.created_at,
        });
        break;
      }

      case "guardrail_blocked":
        items.push({
          id: action.id,
          icon: "🛡",
          title: "Guardrail blocked the proposal",
          detail: String(p.reason),
          tone: "block",
          createdAt: action.created_at,
        });
        break;

      case "agent_incomplete":
        items.push({
          id: action.id,
          icon: "⚠",
          title: "Agent did not reach a decision",
          detail: (p.text as string) || (p.reason as string),
          tone: "warn",
          createdAt: action.created_at,
        });
        break;

      case "human_approved":
        items.push({
          id: action.id,
          icon: "👤",
          title: "Human approved the proposed decision",
          tone: "ok",
          createdAt: action.created_at,
        });
        break;

      case "human_rejected":
        items.push({
          id: action.id,
          icon: "👤",
          title: "Human rejected the ticket",
          detail: (p.note as string) || undefined,
          tone: "block",
          createdAt: action.created_at,
        });
        break;

      case "human_modified":
        items.push({
          id: action.id,
          icon: "👤",
          title: `Human overrode the decision: ${p.decision}${p.decision === "refund" ? ` ${formatMoney(p.refundAmount)}` : ""}`,
          detail: (p.note as string) || undefined,
          createdAt: action.created_at,
        });
        break;

      case "auto_approved":
        items.push({
          id: action.id,
          icon: "⚡",
          title: "Auto-approved — no human review needed",
          detail: String(p.reason),
          tone: "ok",
          createdAt: action.created_at,
        });
        break;

      case "mock_refund_executed":
        items.push({
          id: action.id,
          icon: "💳",
          title: `Mock refund executed: ${formatMoney(p.amount)}`,
          detail: `charge ${String(p.mockChargeId)}`,
          tone: "ok",
          createdAt: action.created_at,
        });
        break;

      default:
        items.push({ id: action.id, icon: "•", title: action.action_type, createdAt: action.created_at });
    }
  }

  return items;
}

export function ReasoningFeed({ actions }: { actions: TicketActionRow[] }) {
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  const items = buildDisplayItems(actions);

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-base">
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
              item.tone === "block" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
              item.tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
              item.tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
              !item.tone && "bg-muted text-muted-foreground",
            )}
          >
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.title}</p>
            {item.detail && <p className="mt-0.5 break-words text-muted-foreground">{item.detail}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {new Date(item.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
