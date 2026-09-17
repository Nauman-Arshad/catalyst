"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { companyPaidSchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setCompanyPaid(values: unknown): Promise<ActionResult> {
  await auth.protect();
  const parsed = companyPaidSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ledger_date, amount_paid } = parsed.data;
  try {
    await sql`
      insert into company_ledger_days (ledger_date, amount_paid)
      values (${ledger_date}, ${amount_paid})
      on conflict (ledger_date)
      do update set amount_paid = excluded.amount_paid, updated_at = now()
    `;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/companies");
  return { ok: true };
}
