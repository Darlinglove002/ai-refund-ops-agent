import { TicketList } from "@/components/ticket-list";
import { DemoBar } from "@/components/demo-bar";
import { listTickets } from "@/lib/tickets";
import { getDemoScenarios } from "@/lib/demoScenarios";

export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  const [tickets, scenarios] = await Promise.all([listTickets(), getDemoScenarios()]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center border-b px-4 py-3">
        <h1 className="text-sm font-semibold">AI Refund Ops Agent</h1>
      </header>
      <DemoBar scenarios={scenarios} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r">
          <TicketList tickets={tickets} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
