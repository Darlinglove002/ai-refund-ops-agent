import { TicketList } from "@/components/ticket-list";
import { listTickets } from "@/lib/tickets";

export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  const tickets = await listTickets();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center border-b px-4 py-3">
        <h1 className="text-sm font-semibold">AI Refund Ops Agent</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r">
          <TicketList tickets={tickets} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
