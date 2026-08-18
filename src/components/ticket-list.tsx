"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import type { TicketListItem } from "@/lib/tickets";
import { cn } from "@/lib/utils";

export function TicketList({ tickets }: { tickets: TicketListItem[] }) {
  const pathname = usePathname();

  if (tickets.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No tickets yet.</p>;
  }

  return (
    <ul className="flex flex-col">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link
            href={`/tickets/${ticket.id}`}
            className={cn(
              "flex flex-col gap-1.5 border-b px-4 py-3 text-sm transition-colors hover:bg-accent",
              pathname === `/tickets/${ticket.id}` && "bg-accent",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{ticket.customerName ?? "Unknown customer"}</span>
              <StatusBadge status={ticket.status} className="shrink-0 text-[11px]" />
            </div>
            <p className="line-clamp-2 text-muted-foreground">{ticket.customer_message}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
