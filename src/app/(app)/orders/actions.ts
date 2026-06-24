"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { orderSchema } from "@/lib/validation";
import { generateOrderNumber } from "@/lib/utils";

export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

export async function createOrder(values: unknown): Promise<ActionResult> {
  await auth.protect();
  const parsed = orderSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const o = parsed.data;

  try {
    const id = await sql.begin(async (tx) => {
      const [order] = await tx`
        insert into orders (order_number, party_id, order_date, status, advance_payment)
        values (${generateOrderNumber()}, ${o.party_id}, ${o.order_date}, ${o.status}, ${o.advance_payment})
        returning id
      `;
      for (const it of o.items) {
        await tx`
          insert into order_items (order_id, product_id, quantity, unit_price)
          values (${order.id}, ${it.product_id}, ${it.quantity}, ${it.unit_price})
        `;
      }
      // Record the advance as a payment so it flows into the party ledger and
      // the order's paid total (single source of truth = the payments table).
      if (o.advance_payment > 0) {
        await tx`
          insert into payments (party_id, order_id, amount, payment_date)
          values (${o.party_id}, ${order.id}, ${o.advance_payment}, ${o.order_date})
        `;
      }
      return order.id as number;
    });
    revalidatePath("/orders");
    revalidatePath("/payments");
    revalidatePath("/");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateOrder(
  id: number,
  values: unknown,
): Promise<ActionResult> {
  await auth.protect();
  const parsed = orderSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const o = parsed.data;

  try {
    await sql.begin(async (tx) => {
      // Advance is set at creation; editing updates header + line items only.
      await tx`
        update orders set party_id = ${o.party_id}, order_date = ${o.order_date}, status = ${o.status}
        where id = ${id}
      `;
      await tx`delete from order_items where order_id = ${id}`;
      for (const it of o.items) {
        await tx`
          insert into order_items (order_id, product_id, quantity, unit_price)
          values (${id}, ${it.product_id}, ${it.quantity}, ${it.unit_price})
        `;
      }
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    revalidatePath("/");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateOrderStatus(
  id: number,
  status: string,
): Promise<ActionResult> {
  await auth.protect();
  if (status !== "progress" && status !== "completed") {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await sql`update orders set status = ${status} where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { ok: true };
}

export async function deleteOrder(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    // order_items cascade; linked payments have order_id set to null.
    await sql`delete from orders where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/");
  return { ok: true };
}
