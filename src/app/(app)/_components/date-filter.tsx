"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/lib/date-range";

export function DateFilter({
  active,
  from,
  to,
}: {
  active: DateRangePreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(active === "custom");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  // Stay on the current route and keep the other params (the company ledger's
  // search, for one) instead of rewriting the whole URL.
  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setRange(range: "7d" | "30d") {
    setShowCustom(false);
    push({ range, from: null, to: null });
  }

  function applyCustom() {
    if (f && t) push({ from: f, to: t, range: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={active === "7d" ? "default" : "outline"}
        size="sm"
        onClick={() => setRange("7d")}
      >
        Last 7 days
      </Button>
      <Button
        variant={active === "30d" ? "default" : "outline"}
        size="sm"
        onClick={() => setRange("30d")}
      >
        Last 30 days
      </Button>
      <Button
        variant={active === "custom" ? "default" : "outline"}
        size="sm"
        onClick={() => setShowCustom((s) => !s)}
      >
        Custom
      </Button>

      <div
        className={cn(
          "flex items-center gap-2",
          showCustom ? "flex" : "hidden",
        )}
      >
        <Input
          type="date"
          value={f}
          onChange={(e) => setF(e.target.value)}
          className="h-8 w-auto"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={t}
          onChange={(e) => setT(e.target.value)}
          className="h-8 w-auto"
        />
        <Button size="sm" onClick={applyCustom}>
          Apply
        </Button>
      </div>
    </div>
  );
}
