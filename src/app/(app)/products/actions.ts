"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { productSchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createProduct(values: unknown): Promise<ActionResult> {
  await auth.protect();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    await sql`insert into products (name, unit_price, company_rate) values (${p.name}, ${p.unit_price}, ${p.company_rate})`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function updateProduct(
  id: number,
  values: unknown,
): Promise<ActionResult> {
  await auth.protect();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    await sql`update products set name = ${p.name}, unit_price = ${p.unit_price}, company_rate = ${p.company_rate} where id = ${id} and deleted_at is null`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    // Products used in orders are archived instead, so past orders and the
    // company ledger keep their line items.
    const [{ used }] = await sql`
      select exists (select 1 from order_items where product_id = ${id}) as used
    `;
    if (used) {
      await sql`update products set deleted_at = now() where id = ${id}`;
    } else {
      await sql`delete from products where id = ${id}`;
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true };
}
