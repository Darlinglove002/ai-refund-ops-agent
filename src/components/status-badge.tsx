import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const STYLES: Record<TicketStatus, string> = {
  new: "bg-muted text-muted-foreground border-transparent",
  analyzing: "bg-blue-100 text-blue-800 border-transparent dark:bg-blue-950 dark:text-blue-300",
  awaiting_approval:
    "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 border-transparent dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<TicketStatus, string> = {
  new: "New",
  analyzing: "Analyzing",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return <Badge className={cn(STYLES[status], className)}>{LABELS[status]}</Badge>;
}
