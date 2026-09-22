"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { returnEditSchema } from "@/lib/validation";
import { applyReturnEdit, revertReturn } from "@/lib/returns";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type ReturnEditResult =
  | { ok: true; refund: number }
  | { ok: false; error: string };

function revalidateReturn(orderId: number, partyId: number) {
  revalidatePath("/returns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/internal-invoice`);
  revalidatePath("/payments");
  revalidatePath("/parties");
  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/party-history");
  revalidatePath("/companies");
  revalidatePath("/");
}


export async function updateReturn(
  values: unknown,
): Promise<ReturnEditResult> {
  await auth.protect();
  const parsed = returnEditSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const result = await sql.begin((tx) => applyReturnEdit(tx, parsed.data));
    revalidateReturn(result.orderId, result.partyId);
    return { ok: true, refund: result.refund };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}


export async function deleteReturn(id: number): Promise<ActionResult> {
  await auth.protect();
  try {
    const { orderId, partyId } = await sql.begin((tx) =>
      revertReturn(tx, id),
    );
    revalidateReturn(orderId, partyId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
