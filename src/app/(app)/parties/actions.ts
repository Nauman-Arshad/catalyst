"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { partySchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createParty(values: unknown): Promise<CreateResult> {
  await auth.protect();
  const parsed = partySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    const [row] = await sql`
      insert into parties (name, phone, address, opening_balance, status)
      values (${p.name}, ${p.phone ?? null}, ${p.address ?? null}, ${p.opening_balance}, ${p.status})
      returning id
    `;
    revalidatePath("/parties");
    return { ok: true, id: row.id as number };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateParty(
  id: number,
  values: unknown,
): Promise<ActionResult> {
  await auth.protect();
  const parsed = partySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = parsed.data;
  try {
    await sql`
      update parties set
        name = ${p.name}, phone = ${p.phone ?? null}, address = ${p.address ?? null},
        opening_balance = ${p.opening_balance}, status = ${p.status}
      where id = ${id}
    `;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/parties");
  revalidatePath(`/parties/${id}`);
  return { ok: true };
}

export async function deleteParty(id: number): Promise<ActionResult> {
  await auth.protect();
  // Rule: cannot delete if the party has orders or payments.
  const [counts] = await sql`
    select
      (select count(*) from orders   where party_id = ${id}) as orders,
      (select count(*) from payments where party_id = ${id}) as payments
  `;
  if (Number(counts.orders) > 0 || Number(counts.payments) > 0) {
    return {
      ok: false,
      error: "Cannot delete this party — it has linked orders or payments.",
    };
  }
  try {
    await sql`delete from parties where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/parties");
  return { ok: true };
}

export type ImportResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

// Bulk import parties from parsed CSV rows. Rows missing a name are skipped.
export async function importParties(rows: unknown): Promise<ImportResult> {
  await auth.protect();
  if (!Array.isArray(rows)) return { ok: false, error: "Invalid CSV payload" };

  let skipped = 0;
  const parties: {
    name: string;
    phone: string | null;
    address: string | null;
    opening_balance: number;
    status: "active" | "inactive";
  }[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, string>;
    const name = (r.name ?? "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    const opening = Number(r.opening_balance);
    parties.push({
      name,
      phone: r.phone?.trim() || null,
      address: r.address?.trim() || null,
      opening_balance: Number.isFinite(opening) ? opening : 0,
      status: r.status?.trim().toLowerCase() === "inactive" ? "inactive" : "active",
    });
  }

  let inserted = 0;
  try {
    // Every row in one statement. If any row is rejected nothing is written,
    // and the rows are retried one by one so the good ones still go in.
    if (parties.length > 0) {
      await sql.begin(
        (tx) =>
          tx`insert into parties ${tx(parties, "name", "phone", "address", "opening_balance", "status")}`,
      );
    }
    inserted = parties.length;
  } catch {
    for (const p of parties) {
      try {
        await sql`
          insert into parties (name, phone, address, opening_balance, status)
          values (${p.name}, ${p.phone}, ${p.address}, ${p.opening_balance}, ${p.status})
        `;
        inserted++;
      } catch {
        skipped++;
      }
    }
  }
  revalidatePath("/parties");
  return { ok: true, inserted, skipped };
}
