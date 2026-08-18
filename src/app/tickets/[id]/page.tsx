import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ReasoningFeed } from "@/components/reasoning-feed";
import { DecisionPanel } from "@/components/decision-panel";
import { getTicketDetail } from "@/lib/tickets";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTicketDetail(id);
  if (!detail) notFound();

  const { ticket, actions, customer, latestTransactionAmount } = detail;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{customer?.name ?? "Unknown customer"}</h2>
          {customer && (
            <p className="text-sm text-muted-foreground">
              {customer.email} · {customer.plan} plan · signed up{" "}
              {new Date(customer.signup_date).toLocaleDateString()} · last active{" "}
              {customer.last_active_at ? new Date(customer.last_active_at).toLocaleDateString() : "never"}
            </p>
          )}
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer message</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{ticket.customer_message}</p>
        </CardContent>
      </Card>

      <DecisionPanel ticket={ticket} actions={actions} maxRefund={latestTransactionAmount} />

      <Separator />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Agent activity log</h3>
        <ReasoningFeed actions={actions} />
      </div>
    </div>
  );
}
