import { Loader2 } from "lucide-react";

export function Loader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-purple-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
