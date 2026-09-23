import { formatCurrency } from "@/lib/utils";

export function ReturnSummary({
  returnAmount,
  newTotal,
  paidAfter,
  remainingAfter,
  refundNow,
}: {
  returnAmount: number;
  newTotal: number;
  paidAfter: number;
  remainingAfter: number;
  refundNow: number;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
      <Line label="Amount" value={returnAmount} tone="text-red-600" />
      <Line label="Order total after return" value={newTotal} />

      <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
        <span className="min-w-0">Remaining balance</span>
        <span className="shrink-0 tabular-nums">
          {formatCurrency(remainingAfter)}
        </span>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={`shrink-0 tabular-nums ${tone ?? ""}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
