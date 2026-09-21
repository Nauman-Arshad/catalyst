import { ShoppingCart, Receipt, Wallet, Clock, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, type summarizeLedger } from "@/lib/utils";

type Summary = ReturnType<typeof summarizeLedger>;

export function describeCompanyBalance(balance: number) {
  if (balance > 0) return { label: "Payable to company", tone: "text-red-600" };
  if (balance < 0)
    return { label: "Credit with company", tone: "text-blue-700" };
  return { label: "Settled", tone: "text-green-700" };
}

export function LedgerSummary({ summary }: { summary: Summary }) {
  const balance = describeCompanyBalance(summary.balance);
  const tiles = [
    {
      label: "Total Orders",
      value: String(summary.orderCount),
      icon: ShoppingCart,
      tone: "bg-purple-50 text-purple-600",
    },
    {
      label: "Total Bill",
      value: formatCurrency(summary.billed),
      icon: Receipt,
      tone: "bg-gray-100 text-gray-700",
    },
    {
      label: "Total Paid",
      value: formatCurrency(summary.paid),
      icon: Wallet,
      tone: "bg-green-50 text-green-700",
      valueTone: "text-green-700",
    },
    {
      // Same figure as Company Balance — what is still outstanding overall,
      // shown here as the running number and there with its meaning.
      label: "Total Pending",
      value: formatCurrency(summary.pending),
      icon: Clock,
      tone: "bg-amber-50 text-amber-700",
      valueTone: balance.tone,
    },
    {
      label: "Company Balance",
      value: formatCurrency(summary.balance),
      sub: balance.label,
      icon: Scale,
      tone: "bg-blue-50 text-blue-700",
      valueTone: balance.tone,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} className="break-inside-avoid">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  t.tone,
                )}
              >
                <t.icon className="size-4" />
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.label}
              </p>
            </div>
            <p
              className={cn(
                "mt-3 text-xl font-semibold tabular-nums",
                t.valueTone,
              )}
            >
              {t.value}
            </p>
            {t.sub ? (
              <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
