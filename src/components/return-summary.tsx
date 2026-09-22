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
      <Line label="Return amount" value={returnAmount} tone="text-red-600" />
      <Line label="Order total after return" value={newTotal} />
      <Line label="Refund to customer" value={refundNow} tone="text-red-600" />
      <Line label="Paid after return" value={paidAfter} tone="text-green-700" />
      <div className="flex justify-between border-t pt-2 font-semibold">
        <span>Remaining balance</span>
        <span className="tabular-nums">{formatCurrency(remainingAfter)}</span>
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
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${tone ?? ""}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
