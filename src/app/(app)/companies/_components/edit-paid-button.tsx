"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  PAYMENT_METHODS,
  PaymentMethodBadge,
} from "@/components/payment-method-badge";
import type { PaymentMethod } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  cn,
  computeOrderCompanyCredit,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import { setOrderPaid } from "../actions";

type DayOrder = {
  id: number;
  order_number: string;
  party_name: string;
  party_id: number;
  total: number;
  paid: number;
  bill: number;
  credit: number;
  methods: PaymentMethod[];
};

export function EditPaidButton({
  date,
  bill,
  paid,
  orders,
}: {
  date: string;
  bill: number;
  paid: number;
  orders: DayOrder[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Per-buyer "received" drafts, keyed by order id. Seeded from the server data
  // each time the dialog opens.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  // The method the next adjustment is recorded under, per buyer. Cash is the
  // default because it is how most money is handed over.
  const [methods, setMethods] = useState<Record<number, PaymentMethod>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Every figure here is at the company rate: `bill` is the buyer's share of
  // the day's company bill, and the draft drives the preview so remaining and
  // the colour update as you type. Overpaying a buyer's share settles it and
  // the surplus comes off what the day still owes the company, which is why
  // the totals row can end up below zero.
  const buyers = orders.map((o) => {
    const draft = drafts[o.id] ?? String(o.paid);
    const amount = Number(draft);
    const valid = draft.trim() !== "" && Number.isFinite(amount) && amount >= 0;
    const effective = valid ? amount : o.paid;
    const { credit, remaining, surplus } = computeOrderCompanyCredit(
      o.bill,
      effective,
    );
    return {
      ...o,
      draft,
      valid,
      dirty: valid && amount !== o.paid,
      effective,
      credit,
      remaining,
      surplus,
      settled: remaining === 0,
      method: methods[o.id] ?? "cash",
    };
  });
  const buyersCredit = buyers.reduce((s, b) => s + b.credit, 0);
  // The day's real position: what is left to pay the company, negative once
  // the buyers have handed over more than the day's bill.
  const buyersRemaining = bill - buyersCredit;

  function onOpenChange(next: boolean) {
    if (next) {
      setDrafts({});
      setMethods({});
    }
    setOpen(next);
  }

  // Saves one buyer's total received. The difference against what the order has
  // already received is stored as a payment dated this ledger day.
  function onSaveBuyer(b: (typeof buyers)[number]) {
    if (!b.dirty || pending) return;
    setSavingId(b.id);
    startTransition(async () => {
      const res = await setOrderPaid({
        order_id: b.id,
        amount_paid: Number(b.draft),
        payment_date: date,
        payment_method: b.method,
      });
      setSavingId(null);
      if (res.ok) {
        toast.success(
          `${b.party_name} · received set to ${formatCurrency(Number(b.draft))}`,
        );
        setDrafts({});
        setMethods({});
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-purple-600"
        onClick={() => onOpenChange(true)}
        aria-label={`Edit payments for ${formatDate(date)}`}
        title="Edit payments received"
      >
        <Pencil />
      </Button>

      <DialogContent className="max-w-2xl">
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle>Payments received</DialogTitle>
            <DialogDescription>
              {formatDate(date)} · company bill {formatCurrency(bill)} · paid{" "}
              {formatCurrency(paid)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">Buyers on this day</h3>
              <p className="text-xs text-muted-foreground">
                Green = company bill covered
              </p>
            </div>

            {buyers.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No orders on this day.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Party</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Bill
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Received
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Remaining
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyers.map((b) => (
                      <tr key={b.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link
                            href={`/parties/${b.party_id}`}
                            title={`${b.order_number} · sale ${formatCurrency(b.total)}`}
                            className={cn(
                              "font-medium hover:underline",
                              b.settled ? "text-green-700" : "text-foreground",
                            )}
                          >
                            {b.party_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(b.bill)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              aria-label={`Amount received from ${b.party_name}`}
                              className={cn(
                                "h-8 w-28 text-right tabular-nums",
                                !b.valid && "border-destructive",
                              )}
                              value={b.draft}
                              disabled={pending}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [b.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  onSaveBuyer(b);
                                }
                              }}
                            />
                            <Select
                              aria-label={`Payment method for ${b.party_name}`}
                              title="How this money came in"
                              className="h-8 w-24 text-xs"
                              value={b.method}
                              disabled={pending}
                              onChange={(e) =>
                                setMethods((m) => ({
                                  ...m,
                                  [b.id]: e.target.value as PaymentMethod,
                                }))
                              }
                            >
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-green-700 disabled:opacity-30"
                              disabled={!b.dirty || pending}
                              onClick={() => onSaveBuyer(b)}
                              aria-label={`Save amount received from ${b.party_name}`}
                              title="Save this buyer's received amount"
                            >
                              {savingId === b.id ? (
                                <span className="text-xs">…</span>
                              ) : (
                                <Check />
                              )}
                            </Button>
                          </div>
                          {b.methods.length > 0 ? (
                            <div
                              className="mt-1 flex flex-wrap items-center justify-end gap-1"
                              title="Methods used by the payments recorded against this order"
                            >
                              {b.methods.map((m) => (
                                <PaymentMethodBadge key={m} method={m} />
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium tabular-nums",
                            b.remaining > 0
                              ? "text-red-600"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatCurrency(b.remaining)}
                          {b.surplus > 0 ? (
                            <span className="block text-xs font-normal text-blue-700">
                              {formatCurrency(b.surplus)} off company
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="px-3 py-2">Totals</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(bill)}
                      </td>
                      <td className="px-3 py-2 pr-[8.5rem] text-right tabular-nums text-green-700">
                        {formatCurrency(buyersCredit)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          buyersRemaining > 0
                            ? "text-red-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatCurrency(buyersRemaining)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Received is the total money in against that order, including
              payments recorded on the Payments page; a change here is saved as
              a payment dated {formatDate(date)}, under the method picked next
              to it. The badges show how that order&apos;s own payments came
              in; money spread over from the party&apos;s unlinked payments has
              no single method, so it carries no badge. All of it counts as
              Paid on the ledger: it clears that buyer&apos;s share of the company bill
              first, and anything beyond it comes off what you still owe the
              company rather than being kept as margin.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
