"use client";

import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  orderSchema,
  type OrderInput,
  type OrderFormValues,
} from "@/lib/validation";
import { createOrder, updateOrder } from "../actions";
import { PartyCombobox, type PartyOption } from "@/components/party-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type ProductOption = { id: number; name: string; unit_price: number };

type ExistingOrder = {
  id: number;
  party_id: number;
  order_date: string;
  status: "progress" | "completed";
  advance_payment: number;
  items: { product_id: number; quantity: number; unit_price: number }[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function OrderForm({
  parties,
  products,
  order,
}: {
  parties: PartyOption[];
  products: ProductOption[];
  order?: ExistingOrder;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdvance, setShowAdvance] = useState(
    Boolean(order && order.advance_payment > 0),
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues, unknown, OrderInput>({
    resolver: zodResolver(orderSchema),
    defaultValues: order
      ? {
          party_id: order.party_id,
          order_date: order.order_date,
          status: order.status,
          advance_payment: order.advance_payment,
          items: order.items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
        }
      : {
          party_id: undefined,
          order_date: today(),
          status: "progress",
          advance_payment: 0,
          items: [{ product_id: undefined, quantity: 1, unit_price: 0 }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const partyId = useWatch({ control, name: "party_id" });
  const watchedItems = useWatch({ control, name: "items" });

  const orderTotal = (watchedItems ?? []).reduce(
    (sum, it) => sum + (Number(it?.quantity) || 0) * (Number(it?.unit_price) || 0),
    0,
  );

  function onProductChange(index: number, productId: string) {
    const p = products.find((x) => x.id === Number(productId));
    if (p) setValue(`items.${index}.unit_price`, p.unit_price);
  }

  function onSubmit(values: OrderInput) {
    const payload = showAdvance
      ? values
      : { ...values, advance_payment: 0 };
    startTransition(async () => {
      const res = order
        ? await updateOrder(order.id, payload)
        : await createOrder(payload);
      if (res.ok) {
        toast.success(order ? "Order updated" : "Order created");
        router.push(res.id ? `/orders/${res.id}` : "/orders");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <input type="hidden" {...register("party_id")} />
      <input type="hidden" {...register("status")} />

      <Card>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer</Label>
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
            <Label>Order date</Label>
            <Input type="date" {...register("order_date")} />
            {errors.order_date ? (
              <p className="text-xs text-destructive">
                {errors.order_date.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="border-b p-5">
          <h2 className="font-semibold">Items</h2>
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="hidden gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[2fr_0.8fr_1fr_1fr_auto]">
            <span>Product</span>
            <span>Quantity</span>
            <span>Unit price</span>
            <span className="text-right">Line total</span>
            <span />
          </div>

          {fields.map((field, index) => {
            const it = watchedItems?.[index];
            const lineTotal =
              (Number(it?.quantity) || 0) * (Number(it?.unit_price) || 0);
            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_0.8fr_1fr_1fr_auto] md:items-center md:border-0 md:p-0"
              >
                <Select
                  defaultValue={it?.product_id ? String(it.product_id) : ""}
                  {...register(`items.${index}.product_id`, {
                    onChange: (e) => onProductChange(index, e.target.value),
                  })}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCurrency(p.unit_price)})
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.quantity`)}
                />
                <Input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.unit_price`)}
                />
                <div className="text-right text-sm font-medium tabular-nums">
                  {formatCurrency(lineTotal)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => fields.length > 1 && remove(index)}
                  disabled={fields.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}

          {errors.items ? (
            <p className="text-xs text-destructive">
              {errors.items.message ??
                errors.items.root?.message ??
                "Check the items."}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ product_id: undefined, quantity: 1, unit_price: 0 })
              }
            >
              <Plus className="size-4" /> Add item
            </Button>
            <div className="text-sm">
              <span className="text-muted-foreground">Order total: </span>
              <span className="text-base font-semibold tabular-nums">
                {formatCurrency(orderTotal)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={showAdvance}
              onChange={(e) => setShowAdvance(e.target.checked)}
              className="size-4 accent-purple-600"
            />
            Advance payment
          </label>
          {showAdvance ? (
            <div className="max-w-xs space-y-1.5">
              <Label>Advance amount (PKR)</Label>
              <Input
                type="number"
                step="0.01"
                {...register("advance_payment")}
              />
              {order ? (
                <p className="text-xs text-muted-foreground">
                  Editing an order does not change the recorded advance payment.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : order ? "Update order" : "Create order"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(order ? `/orders/${order.id}` : "/orders")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
