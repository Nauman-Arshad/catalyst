"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  paymentSchema,
  type PaymentInput,
  type PaymentFormValues,
} from "@/lib/validation";
import { createPayment, updatePayment } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/components/payment-method-badge";
import { PartyCombobox, type PartyOption } from "@/components/party-combobox";
import { Card, CardContent } from "@/components/ui/card";
import type { Payment } from "@/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentForm({
  parties,
  payment,
}: {
  parties: PartyOption[];
  payment?: Payment;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<PaymentFormValues, unknown, PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: payment
      ? {
          party_id: payment.party_id,
          order_id: payment.order_id ?? "",
          amount: payment.amount,
          payment_date: payment.payment_date.slice(0, 10),
          payment_method: payment.payment_method ?? "cash",
        }
      : {
          party_id: undefined,
          order_id: "",
          amount: undefined,
          payment_date: today(),
          payment_method: "cash",
        },
  });

  // The combobox writes into the hidden party_id field.
  const partyId = useWatch({ control, name: "party_id" });

  function onSubmit(values: PaymentInput) {
    startTransition(async () => {
      if (payment) {
        const res = await updatePayment(payment.id, values);
        if (res.ok) {
          toast.success("Payment updated");
          router.push(`/payments/${payment.id}`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } else {
        const res = await createPayment(values);
        if (res.ok) {
          toast.success("Payment recorded");
          router.push(`/payments/${res.id}`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-6">
      <input type="hidden" {...register("order_id")} />
      <input type="hidden" {...register("party_id")} />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Party</Label>
            <PartyCombobox
              parties={parties}
              value={partyId ? Number(partyId) : undefined}
              onChange={(id) =>
                setValue("party_id", id, { shouldValidate: true })
              }
            />
            {errors.party_id ? (
              <p className="text-xs text-destructive">
                {errors.party_id.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Amount (PKR)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("amount")}
            />
            {errors.amount ? (
              <p className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select {...register("payment_method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            {errors.payment_method ? (
              <p className="text-xs text-destructive">
                {errors.payment_method.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Payment date</Label>
            <Input type="date" {...register("payment_date")} />
            {errors.payment_date ? (
              <p className="text-xs text-destructive">
                {errors.payment_date.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : payment ? "Update payment" : "Record payment"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(payment ? `/payments/${payment.id}` : "/payments")
          }
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
