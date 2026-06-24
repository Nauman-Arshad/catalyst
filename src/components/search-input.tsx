"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchInput({
  defaultValue = "",
  placeholder = "Search…",
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: string) {
    const qs = next.trim() ? `?q=${encodeURIComponent(next.trim())}` : "";
    startTransition(() => router.replace(`${pathname}${qs}`, { scroll: false }));
  }

  function onChange(next: string) {
    setValue(next);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => push(next), 300);
  }

  function clear() {
    setValue("");
    if (timeout.current) clearTimeout(timeout.current);
    push("");
  }

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
        {pending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
