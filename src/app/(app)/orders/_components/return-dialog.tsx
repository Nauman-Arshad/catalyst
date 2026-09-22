"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  returnSchema,
  type ReturnInput,
  type ReturnFormValues,
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
import { createReturn } from "../actions";

export type ReturnLine = {
  id: number;
  product_name: string;
  quantity: number; // what is still on the order
  unit_price: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function qtyOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Takes products back off an order.
 *
 * Everything the return touches is derived from the order's line items and the
 * payments table, so the dialog only has to collect quantities: the amount, the
 * new order total and the refund are the same arithmetic the server redoes
 * against the locked rows. Two steps — enter, then confirm what will change.
 */
export function ReturnButton({
  orderId,
  orderNumber,
  lines,
  paid,
}: {
  orderId: number;
  orderNumber: string;
  lines: ReturnLine[];
  paid: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [pending, startTransition] = useTransition();

  const defaults = (): ReturnFormValues => ({
    return_date: today(),
    note: "",
    refund: true,
    payment_method: "cash",
    items: lines.map((l) => ({ order_item_id: l.id, quantity: undefined })),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReturnFormValues, unknown, ReturnInput>({
    resolver: zodResolver(returnSchema),
    defaultValues: defaults(),
  });

  const watchedItems = useWatch({ control, name: "items" });
  const wantsRefund = useWatch({ control, name: "refund" });

  const rows = lines.map((line, index) => {
    const quantity = qtyOf(watchedItems?.[index]?.quantity);
    return {
      line,
      index,
      quantity,
      amount: roundMoney(quantity * line.unit_price),
      overLimit: quantity > line.quantity,
    };
  });
  const returning = rows.filter((r) => r.quantity > 0);
  const overLimit = rows.some((r) => r.overLimit);

  const orderTotal = roundMoney(
    lines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
  );
  const returnAmount = roundMoney(rows.reduce((s, r) => s + r.amount, 0));
  const newTotal = roundMoney(orderTotal - returnAmount);
  const refundDue = computeRefundDue(newTotal, paid, returnAmount);
  const refundNow = wantsRefund ? refundDue : 0;
  const paidAfter = roundMoney(paid - refundNow);
  const remainingAfter = roundMoney(newTotal - paidAfter);

  function onOpenChange(next: boolean) {
    if (next) reset(defaults());
    setStep("edit");
    setOpen(next);
  }

  function onSubmit(values: ReturnInput) {
    if (step === "edit") {
      setStep("confirm");
      return;
    }
    startTransition(async () => {
      const res = await createReturn(orderId, values);
      if (res.ok) {
        toast.success(
          res.refund > 0
            ? `Return processed · ${formatCurrency(res.refund)} refunded`
            : "Return processed",
        );
        setOpen(false);
        setStep("edit");
        reset(defaults());
        router.refresh();
      } else {
        toast.error(res.error);
        setStep("edit");
      }
    });
  }

  const nothingToReturn = lines.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(true)}
        disabled={nothingToReturn}
        title={
          nothingToReturn
            ? "Nothing left on this order to return"
            : "Return products from this order"
        }
      >
        <Undo2 className="size-4" /> Return Products
      </Button>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>
              {step === "edit"
                ? `Return products · ${orderNumber}`
                : "Confirm this return"}
            </DialogTitle>
            <DialogDescription>
              {step === "edit"
                ? "Returned quantities come off the order and off the company bill. Anything the customer has overpaid as a result is refunded."
                : "Check the figures below. This cannot be undone from the app."}
            </DialogDescription>
          </DialogHeader>

          {step === "edit" ? (
            <div className="space-y-4">
              <div className="hidden gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[2fr_0.7fr_0.9fr_1fr]">
                <span>Product</span>
                <span className="text-right">On order</span>
                <span>Return qty</span>
                <span className="text-right">Return amount</span>
              </div>

              {rows.map(({ line, index, amount, overLimit: over }) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_0.7fr_0.9fr_1fr] sm:items-center sm:border-0 sm:p-1"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(line.unit_price)} each
                    </p>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground sm:text-right">
                    <span className="sm:hidden">On order: </span>
                    {line.quantity}
                  </div>
                  <div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={line.quantity}
                      placeholder="0"
                      aria-label={`Quantity of ${line.product_name} to return`}
                      aria-invalid={over || undefined}
                      {...register(`items.${index}.quantity`)}
                    />
                    <input
                      type="hidden"
                      {...register(`items.${index}.order_item_id`)}
                    />
                  </div>
                  <div className="text-sm font-medium tabular-nums sm:text-right">
                    {formatCurrency(amount)}
                    {over ? (
                      <p className="text-xs font-normal text-destructive">
                        Only {line.quantity} left
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}

              {errors.items ? (
                <p className="text-xs text-destructive">
                  {errors.items.message ??
                    errors.items.root?.message ??
                    "Check the quantities."}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="return-date">Return date</Label>
                  <Input
                    id="return-date"
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
                  <Label htmlFor="return-note">Reason (optional)</Label>
                  <Input
                    id="return-note"
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
                        This order is paid past its new total by that much.
                        Leave it unticked to keep the money on the
                        customer&apos;s account as credit instead.
                      </span>
                    </span>
                  </label>
                  {wantsRefund ? (
                    <div className="max-w-[12rem] space-y-1.5">
                      <Label htmlFor="return-method">Paid back by</Label>
                      <Select id="return-method" {...register("payment_method")}>
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
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Going back
                </p>
                {returning.map(({ line, quantity, amount }) => (
                  <div
                    key={line.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="font-medium tabular-nums">
                        {quantity}
                      </span>{" "}
                      × {line.product_name}
                      <span className="text-muted-foreground">
                        {" "}
                        (of {line.quantity})
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>

              <ReturnSummary
                returnAmount={returnAmount}
                newTotal={newTotal}
                paidAfter={paidAfter}
                remainingAfter={remainingAfter}
                refundNow={refundNow}
              />

              <p className="text-xs text-muted-foreground">
                The company bill for this order drops by the same quantities at
                their company rates, so the company ledger and balance follow.
              </p>
            </div>
          )}

          <DialogFooter>
            {step === "confirm" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setStep("edit")}
              >
                Back
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
            )}
            <Button
              type="submit"
              disabled={
                pending || (step === "edit" && (overLimit || returning.length === 0))
              }
            >
              {step === "edit"
                ? "Review return"
                : pending
                  ? "Processing…"
                  : "Confirm return"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
