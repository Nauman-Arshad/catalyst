"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  returnEditSchema,
  type ReturnEditInput,
  type ReturnEditFormValues,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { PAYMENT_METHODS } from "@/components/payment-method-badge";
import { ReturnSummary } from "@/components/return-summary";
import { computeRefundDue, formatCurrency, roundMoney } from "@/lib/utils";
import type { ReturnRecord } from "@/lib/returns";
import { updateReturn } from "../actions";

function qtyOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Quantities are whole units, so keys that could only type a fraction, an
// exponent or a sign are refused before they reach the input.
function blockNonDigits(e: React.KeyboardEvent<HTMLInputElement>) {
  if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault();
}

export function EditReturnButton({ record }: { record: ReturnRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaults = (): ReturnEditFormValues => ({
    id: record.id,
    return_date: record.return_date,
    note: record.note ?? "",

    refund: record.refund_amount > 0,
    payment_method: record.refund_method ?? "cash",
    items: record.items.map((i) => ({
      return_item_id: i.id,
      quantity: i.quantity,
    })),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReturnEditFormValues, unknown, ReturnEditInput>({
    resolver: zodResolver(returnEditSchema),
    defaultValues: defaults(),
  });

  const watchedItems = useWatch({ control, name: "items" });
  const wantsRefund = useWatch({ control, name: "refund" });

  const rows = record.items.map((item, index) => {
    const quantity = qtyOf(watchedItems?.[index]?.quantity);

    const max = roundMoney(item.quantity + item.line_remaining);
    return {
      item,
      index,
      quantity,
      max,
      amount: roundMoney(quantity * item.unit_price),
      overLimit: quantity > max,
      notWhole: !Number.isInteger(quantity),
    };
  });
  const overLimit = rows.some((r) => r.overLimit);
  const notWhole = rows.some((r) => r.notWhole);
  const anyQuantity = rows.some((r) => r.quantity > 0);

  const restoredTotal = roundMoney(record.order_total + record.total_amount);
  const restoredPaid = roundMoney(record.order_paid + record.refund_amount);

  const returnAmount = roundMoney(rows.reduce((s, r) => s + r.amount, 0));
  const newTotal = roundMoney(restoredTotal - returnAmount);
  const refundDue = computeRefundDue(newTotal, restoredPaid, returnAmount);
  const refundNow = wantsRefund ? refundDue : 0;
  const paidAfter = roundMoney(restoredPaid - refundNow);
  const remainingAfter = roundMoney(newTotal - paidAfter);

  function onOpenChange(next: boolean) {
    if (next) reset(defaults());
    setOpen(next);
  }

  function onSubmit(values: ReturnEditInput) {
    startTransition(async () => {
      const res = await updateReturn(values);
      if (res.ok) {
        toast.success(
          res.refund > 0
            ? `Return updated · ${formatCurrency(res.refund)} refunded`
            : "Return updated",
        );
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
        aria-label={`Edit the return of ${formatCurrency(record.total_amount)} on ${record.order_number}`}
        title="Edit this return"
      >
        <Pencil />
      </Button>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit return · {record.order_number}</DialogTitle>
            <DialogDescription>
              The original quantities go back on the order first, then these are
              taken off it, so the order, the refund and the company bill all
              land where entering these quantities in the first place would have
              put them.
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" {...register("id")} />

          <div className="space-y-4">
            <div className="hidden gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[2fr_0.7fr_0.9fr_1fr]">
              <span>Product</span>
              <span className="text-right">Max</span>
              <span>Returned qty</span>
              <span className="text-right">Return amount</span>
            </div>

            {rows.map(
              ({
                item,
                index,
                max,
                amount,
                overLimit: over,
                notWhole: frac,
              }) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_0.7fr_0.9fr_1fr] sm:items-center sm:border-0 sm:p-1"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unit_price)} each
                    </p>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground sm:text-right">
                    <span className="sm:hidden">Max: </span>
                    {max}
                  </div>
                  <div>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max={max}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      aria-label={`Quantity of ${item.product_name} returned`}
                      aria-invalid={over || frac || undefined}
                      onKeyDown={blockNonDigits}
                      {...register(`items.${index}.quantity`)}
                    />
                    <input
                      type="hidden"
                      {...register(`items.${index}.return_item_id`)}
                    />
                  </div>
                  <div className="text-sm font-medium tabular-nums sm:text-right">
                    {formatCurrency(amount)}
                    {over || frac ? (
                      <p className="text-xs font-normal text-destructive">
                        {frac ? "Whole numbers only" : `At most ${max}`}
                      </p>
                    ) : null}
                  </div>
                </div>
              ),
            )}

            {errors.items ? (
              <p className="text-xs text-destructive">
                {errors.items.message ??
                  errors.items.root?.message ??
                  "Check the quantities."}
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Setting a product to 0 drops it from this return. To undo the
              return altogether, delete it instead.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`ret-date-${record.id}`}>Return date</Label>
                <Input
                  id={`ret-date-${record.id}`}
                  type="date"
                  {...register("return_date")}
                />
                {errors.return_date ? (
                  <p className="text-xs text-destructive">
                    {errors.return_date.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ret-note-${record.id}`}>
                  Reason (optional)
                </Label>
                <Input
                  id={`ret-note-${record.id}`}
                  placeholder="Damaged, wrong shade…"
                  {...register("note")}
                />
              </div>
            </div>

            <ReturnSummary
              returnAmount={returnAmount}
              newTotal={newTotal}
              paidAfter={paidAfter}
              remainingAfter={remainingAfter}
              refundNow={refundNow}
            />

            {refundDue > 0 ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-purple-600"
                    {...register("refund")}
                  />
                  <span>
                    Refund {formatCurrency(refundDue)} to the customer
                    <span className="block text-xs font-normal text-muted-foreground">
                      The original refund is undone first, so this is the whole
                      refund for this return, not an extra one. Leave it
                      unticked to keep the money on the customer&apos;s account
                      as credit.
                    </span>
                  </span>
                </label>
                {wantsRefund ? (
                  <div className="max-w-[12rem] space-y-1.5">
                    <Label htmlFor={`ret-method-${record.id}`}>
                      Paid back by
                    </Label>
                    <Select
                      id={`ret-method-${record.id}`}
                      {...register("payment_method")}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={pending || overLimit || notWhole || !anyQuantity}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
