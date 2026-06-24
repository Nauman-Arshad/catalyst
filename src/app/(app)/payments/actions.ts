"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { paymentSchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createPayment(values: unknown): Promise<CreateResult> {
  await auth.protect();
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    const [row] = await sql`
      insert into payments (party_id, order_id, amount, payment_date)
      values (${p.party_id}, ${p.order_id ?? null}, ${p.amount}, ${p.payment_date})
      returning id
    `;
    revalidatePath("/payments");
    revalidatePath("/");
    if (p.order_id) revalidatePath(`/orders/${p.order_id}`);
    revalidatePath(`/parties/${p.party_id}`);
    return { ok: true, id: row.id as number };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updatePayment(
  id: number,
  values: unknown,
): Promise<ActionResult> {
  await auth.protect();
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    await sql`
      update payments set party_id = ${p.party_id}, order_id = ${p.order_id ?? null},
        amount = ${p.amount}, payment_date = ${p.payment_date}
      where id = ${id}
    `;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/payments");
  revalidatePath(`/payments/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deletePayment(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    await sql`delete from payments where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/payments");
  revalidatePath("/");
  return { ok: true };
}
