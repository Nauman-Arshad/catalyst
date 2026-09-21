"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  companyPaymentSchema,
  type CompanyPaymentInput,
  type CompanyPaymentFormValues,
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { addCompanyPayment, updateCompanyPayment } from "../actions";
import type { CompanyPayment } from "@/types";

type Result = { ok: true } | { ok: false; error: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blank(): CompanyPaymentFormValues {
  return {
    payment_date: today(),
    amount: undefined,
    payment_method: "cash",
  };
}

const DIALOG_NOTE =
  "Money paid straight to the company. It is not tied to any day's bill, but it counts towards Total Paid and comes off Pending and the Company Balance.";

/**
 * The add and edit dialogs are the same three fields over the same schema —
 * only the trigger, the wording and what `save` does differ. `defaults` is a
 * function so the fields are re-read from the server's copy of the row every
 * time the dialog opens.
 */
function CompanyPaymentDialog({
  idPrefix,
  title,
  submitLabel,
  defaults,
  save,
  toastMessage,
  clearOnSave = false,
  renderTrigger,
}: {
  idPrefix: string;
  title: string;
  submitLabel: string;
  defaults: () => CompanyPaymentFormValues;
  save: (values: CompanyPaymentInput) => Promise<Result>;
  toastMessage: (values: CompanyPaymentInput) => string;
  clearOnSave?: boolean;
  renderTrigger: (open: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyPaymentFormValues, unknown, CompanyPaymentInput>({
    resolver: zodResolver(companyPaymentSchema),
    defaultValues: defaults(),
  });

  function onOpenChange(next: boolean) {
    if (next) reset(defaults());
    setOpen(next);
  }

  function onSubmit(values: CompanyPaymentInput) {
    startTransition(async () => {
      const res = await save(values);
      if (res.ok) {
        toast.success(toastMessage(values));
        if (clearOnSave) reset(blank());
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {renderTrigger(() => onOpenChange(true))}

      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{DIALOG_NOTE}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-amount`}>Amount (PKR)</Label>
              <Input
                id={`${idPrefix}-amount`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("amount")}
              />
              {errors.amount ? (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-date`}>Date</Label>
                <Input
                  id={`${idPrefix}-date`}
                  type="date"
                  {...register("payment_date")}
                />
                {errors.payment_date ? (
                  <p className="text-xs text-destructive">
                    {errors.payment_date.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-method`}>Method</Label>
                <Select
                  id={`${idPrefix}-method`}
                  {...register("payment_method")}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddPaymentButton() {
  return (
    <CompanyPaymentDialog
      idPrefix="cp-add"
      title="Add payment to company"
      submitLabel="Add payment"
      defaults={blank}
      clearOnSave
      save={addCompanyPayment}
      toastMessage={(v) =>
        `${formatCurrency(v.amount)} paid to company · ${formatDate(v.payment_date)}`
      }
      renderTrigger={(open) => (
        <Button type="button" onClick={open}>
          <Plus className="size-4" /> Add Payment
        </Button>
      )}
    />
  );
}

export function EditPaymentButton({ payment }: { payment: CompanyPayment }) {
  return (
    <CompanyPaymentDialog
      idPrefix={`cp-edit-${payment.id}`}
      title="Edit payment to company"
      submitLabel="Save changes"
      defaults={() => ({
        payment_date: payment.payment_date,
        amount: Number(payment.amount),
        payment_method: payment.payment_method,
      })}
      save={(values) => updateCompanyPayment({ ...values, id: payment.id })}
      toastMessage={(v) =>
        `Updated · ${formatCurrency(v.amount)} on ${formatDate(v.payment_date)}`
      }
      renderTrigger={(open) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-purple-600"
          onClick={open}
          aria-label={`Edit payment of ${formatCurrency(Number(payment.amount))} on ${formatDate(payment.payment_date)}`}
          title="Edit this payment"
        >
          <Pencil />
        </Button>
      )}
    />
  );
}
