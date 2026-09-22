"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { orderSchema, returnSchema } from "@/lib/validation";
import { applyReturn, type AppliedReturn } from "@/lib/returns";
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
        // Snapshot the product's company rate for the company ledger.
        await tx`
          insert into order_items (order_id, product_id, quantity, unit_price, company_rate)
          values (${order.id}, ${it.product_id}, ${it.quantity}, ${it.unit_price},
                  (select company_rate from products where id = ${it.product_id}))
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
    revalidatePath("/companies");
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
      // Keep the company rates already snapshotted for products still on the
      // order, so editing doesn't rewrite that day's company bill.
      const oldRates = await tx`
        select distinct on (product_id) product_id, company_rate
        from order_items where order_id = ${id} and company_rate is not null
        order by product_id, id
      `;
      const rateByProduct = new Map(
        oldRates.map((r) => [Number(r.product_id), Number(r.company_rate)]),
      );
      await tx`delete from order_items where order_id = ${id}`;
      for (const it of o.items) {
        const kept = rateByProduct.get(it.product_id) ?? null;
        await tx`
          insert into order_items (order_id, product_id, quantity, unit_price, company_rate)
          values (${id}, ${it.product_id}, ${it.quantity}, ${it.unit_price},
                  coalesce(${kept}::numeric, (select company_rate from products where id = ${it.product_id})))
        `;
      }
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    revalidatePath("/");
    revalidatePath("/companies");
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
  revalidatePath("/companies");
  return { ok: true };
}

// ── Product returns ──────────────────────────────────────────────────────────

export type ReturnResult =
  | { ok: true; id: number; refund: number }
  | { ok: false; error: string };

/** Who processed a return, for the history. The Clerk id is always recorded;
 *  the readable name is a nicety, so failing to fetch it isn't fatal. */
async function currentUserLabel(): Promise<string | null> {
  try {
    const user = await currentUser();
    if (!user) return null;
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return name || user.username || email;
  } catch {
    return null;
  }
}


export async function createReturn(
  orderId: number,
  values: unknown,
): Promise<ReturnResult> {
  const { userId } = await auth.protect();
  const parsed = returnSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const actor = { userId: userId ?? null, name: await currentUserLabel() };

  let result: AppliedReturn;
  try {
    result = await sql.begin((tx) =>
      applyReturn(tx, orderId, parsed.data, actor),
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/internal-invoice`);
  revalidatePath("/returns");
  revalidatePath("/payments");
  revalidatePath("/parties");
  revalidatePath(`/parties/${result.partyId}`);
  revalidatePath("/party-history");
  revalidatePath("/companies");
  revalidatePath("/");
  return { ok: true, id: result.id, refund: result.refund };
}
