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
    await sql`insert into products (name, unit_price) values (${p.name}, ${p.unit_price})`;
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
    await sql`update products set name = ${p.name}, unit_price = ${p.unit_price} where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    await sql`delete from products where id = ${id}`;
  } catch {
    return {
      ok: false,
      error: "Cannot delete this product — it is used in one or more orders.",
    };
  }
  revalidatePath("/products");
  return { ok: true };
}
