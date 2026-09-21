"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import {
  companyPaymentEditSchema,
  companyPaymentSchema,
  orderPaidSchema,
} from "@/lib/validation";
import { receivedForOrder } from "./_lib/ledger";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Set the total a party has paid against one of its orders. The payments table
// stays the single source of truth, so the difference between the new total and
// what the order has already received — including the party's unlinked
// payments — is inserted as one payment row (negative when the figure is
// corrected downwards).
export async function setOrderPaid(values: unknown): Promise<ActionResult> {
  await auth.protect();
  const parsed = orderPaidSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { order_id, amount_paid, payment_date, payment_method } = parsed.data;

  let partyId: number;
  try {
    const current = await receivedForOrder(order_id);
    partyId = current.partyId;
    const delta = Math.round((amount_paid - current.received) * 100) / 100;
    if (delta !== 0) {
      await sql`
        insert into payments (party_id, order_id, amount, payment_date, payment_method)
        values (${partyId}, ${order_id}, ${delta}, ${payment_date}, ${payment_method})
      `;
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/companies");
  revalidatePath("/payments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${order_id}`);
  revalidatePath("/parties");
  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/party-history");
  revalidatePath("/");
  return { ok: true };
}

// Record money paid straight to the company.
//
// It is not applied to any single day's bill — the day ledger stays derived
// from party receipts alone — but it is money paid, so the ledger page adds it
// into Total Paid and takes it off Total Pending and the Company Balance.
// There is no cap: it is not bounded by a bill it is not tied to, and paying
// past the total billed simply leaves a credit with the company.
export async function addCompanyPayment(values: unknown): Promise<ActionResult> {
  await auth.protect();
  const parsed = companyPaymentSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { payment_date, amount, payment_method } = parsed.data;

  try {
    await sql`
      insert into company_payments (payment_date, amount, payment_method)
      values (${payment_date}, ${amount}, ${payment_method})
    `;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/companies");
  revalidatePath("/");
  return { ok: true };
}

// Correct one of those rows in place: date, amount or method. Nothing is
// derived from it beyond the totals, so a plain update is enough.
export async function updateCompanyPayment(
  values: unknown,
): Promise<ActionResult> {
  await auth.protect();
  const parsed = companyPaymentEditSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { id, payment_date, amount, payment_method } = parsed.data;

  try {
    const rows = await sql`
      update company_payments
      set payment_date = ${payment_date},
          amount = ${amount},
          payment_method = ${payment_method}
      where id = ${id}
      returning id
    `;
    if (rows.length === 0) return { ok: false, error: "Payment not found" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/companies");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCompanyPayment(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    await sql`delete from company_payments where id = ${id}`;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/companies");
  revalidatePath("/");
  return { ok: true };
}
