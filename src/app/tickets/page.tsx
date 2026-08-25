import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats } from "@/lib/tickets";
import { cn } from "@/lib/utils";

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "block";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
            tone === "block" && "text-red-600 dark:text-red-400",
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function TicketsIndexPage() {
  const stats = await getDashboardStats();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Aggregated from every ticket this project has ever processed. Select a ticket from the list on the
          left to see its individual decision trail.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Tickets processed" value={String(stats.totalTickets)} />
        <StatTile label="Auto-approved (no human click)" value={String(stats.autoApprovedCount)} tone="ok" />
        <StatTile label="Approved by a human" value={String(stats.humanApprovedCount)} tone="ok" />
        <StatTile label="Rejected by a human" value={String(stats.humanRejectedCount)} tone="block" />
        <StatTile
          label="Guardrail catches (bad proposals blocked)"
          value={String(stats.guardrailBlockedCount)}
          tone="warn"
        />
        <StatTile
          label="Total refunded (mock)"
          value={`$${stats.totalRefunded.toFixed(2)}`}
          tone={stats.totalRefunded > 0 ? "ok" : undefined}
        />
      </div>

      {stats.guardrailBlockedCount > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle className="text-base">🛡 Why &quot;guardrail catches&quot; matters</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats.guardrailBlockedCount} time{stats.guardrailBlockedCount === 1 ? "" : "s"}, the agent
              proposed a refund decision that didn&apos;t hold up against the customer&apos;s actual account
              data — a code check caught it before it was ever shown to a human as something to approve.
              That&apos;s the whole argument for not trusting the model&apos;s output on its own.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
