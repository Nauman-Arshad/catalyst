"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  companyDayPaidSchema,
  type CompanyDayPaidFormValues,
  type CompanyDayPaidInput,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  blockNonDigits,
  cn,
  computeOrderCompanyCredit,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type { CompanyLedgerDay } from "@/types";
import { setCompanyDayPaid } from "../actions";

// A blank or half-typed input counts as 0 in the preview; the schema still
// rejects it on save.
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toneFor(n: number) {
  return n > 0 ? "text-red-600" : n < 0 ? "text-blue-700" : "text-green-700";
}

/**
 * Edit what was paid to the company for one day: an amount against each
 * party's order, plus one for the day as a whole. It is saved for the Company
 * Ledger only and never touches customer payments. The preview recomputes
 * each party's due and the day's To Pay as you type.
 */
export function DayPaidButton({ day }: { day: CompanyLedgerDay }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaults = (): CompanyDayPaidFormValues => ({
    ledger_date: day.date,
    amount_paid: day.day_paid,
    orders: day.orders.map((o) => ({ order_id: o.id, amount_paid: o.paid })),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CompanyDayPaidFormValues, unknown, CompanyDayPaidInput>({
    resolver: zodResolver(companyDayPaidSchema),
    defaultValues: defaults(),
  });

  const draftDay = num(useWatch({ control, name: "amount_paid" }));
  const draftOrders = useWatch({ control, name: "orders" }) ?? [];
  const parties = day.orders.map((o, i) => ({
    ...o,
    ...computeOrderCompanyCredit(o.bill, num(draftOrders[i]?.amount_paid)),
  }));
  const paid = parties.reduce((s, p) => s + p.credit, 0) + draftDay;
  const toPay = day.bill - paid;

  function onOpenChange(next: boolean) {
    if (next) reset(defaults());
    setOpen(next);
  }

  function onSubmit(values: CompanyDayPaidInput) {
    startTransition(async () => {
      const res = await setCompanyDayPaid(values);
      if (res.ok) {
        toast.success(`${formatDate(day.date)} · payments saved`);
        setOpen(false);
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
        aria-label={`Edit payments for ${formatDate(day.date)}`}
        title="Edit payments"
      >
        <Pencil />
      </Button>

      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit payments · {formatDate(day.date)}</DialogTitle>
            <DialogDescription>
              Company bill {formatCurrency(day.bill)}. Amounts entered here
              count on the Company Ledger only; they don&apos;t change any
              party&apos;s balance or the Payments page. Set an amount to 0 to
              clear it.
            </DialogDescription>
          </DialogHeader>

          {parties.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No orders on this day.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Party</th>
                    <th className="px-3 py-2 text-right font-medium">Bill</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p, i) => {
                    const error = errors.orders?.[i]?.amount_paid?.message;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "font-medium",
                              p.remaining === 0 && "text-green-700",
                            )}
                          >
                            {p.party_name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {p.order_number}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(p.bill)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="hidden"
                            {...register(`orders.${i}.order_id`)}
                          />
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            onKeyDown={blockNonDigits}
                            aria-label={`Amount paid for ${p.party_name}`}
                            className={cn(
                              "ml-auto h-8 w-28 text-right tabular-nums",
                              error && "border-destructive",
                            )}
                            disabled={pending}
                            {...register(`orders.${i}.amount_paid`)}
                          />
                          {error ? (
                            <p className="mt-1 text-right text-xs text-destructive">
                              {error}
                            </p>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium tabular-nums",
                            p.remaining > 0
                              ? "text-red-600"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatCurrency(p.remaining)}
                          {p.surplus > 0 ? (
                            <span className="block text-xs font-normal text-blue-700">
                              {formatCurrency(p.surplus)} off company
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`day-paid-${day.date}`}>
              Paid for the day, no party (PKR)
            </Label>
            <Input
              id={`day-paid-${day.date}`}
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              pattern="[0-9]*"
              onKeyDown={blockNonDigits}
              placeholder="0"
              disabled={pending}
              {...register("amount_paid")}
            />
            {errors.amount_paid ? (
              <p className="text-xs text-destructive">
                {errors.amount_paid.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span>
              Paid{" "}
              <span className="font-medium tabular-nums text-green-700">
                {formatCurrency(paid)}
              </span>
            </span>
            <span className={cn("font-medium tabular-nums", toneFor(toPay))}>
              {toPay > 0
                ? `To pay ${formatCurrency(toPay)}`
                : toPay < 0
                  ? `${formatCurrency(-toPay)} paid over the bill`
                  : "Fully paid"}
            </span>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
