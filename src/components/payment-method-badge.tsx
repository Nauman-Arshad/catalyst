import { Banknote, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

// The two ways money comes in. `PAYMENT_METHODS` drives the form's select, so
// adding a method here (plus the check constraint in db/schema.sql and the Zod
// enum in src/lib/validation.ts) is all the UI needs.
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

const methods = {
  cash: { label: "Cash", icon: Banknote, className: "bg-green-100 text-green-800" },
  bank: { label: "Bank", icon: Landmark, className: "bg-sky-100 text-sky-800" },
} as const satisfies Record<
  PaymentMethod,
  { label: string; icon: typeof Banknote; className: string }
>;

export function PaymentMethodBadge({
  method,
  className,
}: {
  // Rows written before the column existed fall back to cash, which is the
  // column default.
  method: PaymentMethod | null | undefined;
  className?: string;
}) {
  const m = methods[method ?? "cash"] ?? methods.cash;
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        m.className,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {m.label}
    </span>
  );
}
