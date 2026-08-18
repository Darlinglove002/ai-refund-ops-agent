"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DemoScenarioState } from "@/lib/demoScenarios";

export function DemoBar({ scenarios }: { scenarios: DemoScenarioState[] }) {
  const router = useRouter();
  const [priming, setPriming] = useState(false);

  const unprimed = scenarios.filter((s) => s.ticketId && (s.status === "new" || s.status === "analyzing"));

  async function prime() {
    setPriming(true);
    try {
      await fetch("/api/demo/prime", { method: "POST" });
      router.refresh();
    } finally {
      setPriming(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
      <span className="mr-1 text-xs font-medium text-muted-foreground">Demo Mode:</span>
      {scenarios.map((s) => {
        const ready = s.status !== null && s.status !== "new" && s.status !== "analyzing";
        return (
          <Link
            key={s.key}
            href={s.ticketId ? `/tickets/${s.ticketId}` : "#"}
            title={s.description}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent",
              !s.ticketId && "pointer-events-none opacity-50",
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-muted-foreground/40")}
            />
            {s.label}
          </Link>
        );
      })}
      {unprimed.length > 0 && (
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={priming} onClick={prime}>
          {priming ? "Priming…" : `Prime ${unprimed.length} scenario${unprimed.length > 1 ? "s" : ""}`}
        </Button>
      )}
    </div>
  );
}
