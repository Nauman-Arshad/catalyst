"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DateFilter({
  active,
  from,
  to,
}: {
  active: "7d" | "30d" | "custom";
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(active === "custom");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function setRange(range: "7d" | "30d") {
    setShowCustom(false);
    router.push(`/?range=${range}`);
  }

  function applyCustom() {
    if (f && t) router.push(`/?from=${f}&to=${t}`);
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
