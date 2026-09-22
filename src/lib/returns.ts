import "server-only";
import type { TransactionSql } from "postgres";
import { sql } from "@/lib/db";
import type { PaymentMethod } from "@/types";
import { computeRefundDue, roundMoney } from "@/lib/utils";
import type { ReturnEditInput, ReturnInput } from "@/lib/validation";

export type ReturnRecordItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  company_rate: number | null;

  line_remaining: number;
};

export type ReturnRecord = {
  id: number;
  order_id: number;
  order_number: string;
  party_id: number;
  party_name: string;
  return_date: string;
  total_amount: number;
  company_amount: number;
  refund_amount: number;
  note: string | null;
  refund_method: PaymentMethod | null; // of the refund payment, when there was one
  created_by_name: string | null;
  created_at: string;
  
  order_total: number;
  order_paid: number;
  items: ReturnRecordItem[];
};

type HeaderRow = Omit<ReturnRecord, "items">;
type ItemRow = ReturnRecordItem & { return_id: number };

export async function loadReturns(orderId?: number): Promise<ReturnRecord[]> {
  const scope = orderId ? sql`where r.order_id = ${orderId}` : sql``;
  const headers = (await sql`
    select r.id, r.order_id, o.order_number, o.party_id, p.name as party_name,
      r.return_date, r.total_amount, r.company_amount, r.refund_amount,
      r.note, pay.payment_method as refund_method, r.created_by_name, r.created_at,
      coalesce((select sum(quantity * unit_price) from order_items
                where order_id = o.id), 0) as order_total,
      coalesce((select sum(amount) from payments where order_id = o.id), 0) as order_paid
    from product_returns r
    join orders o on o.id = r.order_id
    join parties p on p.id = o.party_id
    left join payments pay on pay.id = r.payment_id
    ${scope}
    order by r.return_date desc, r.created_at desc
  `) as unknown as HeaderRow[];

  if (headers.length === 0) return [];

  const items = (await sql`
    select ri.return_id, ri.id, ri.product_id, pr.name as product_name,
      ri.quantity, ri.unit_price, ri.company_rate,
      coalesce(oi.quantity, 0) as line_remaining
    from product_return_items ri
    join products pr on pr.id = ri.product_id
    left join order_items oi on oi.id = ri.order_item_id
    where ri.return_id in ${sql(headers.map((h) => Number(h.id)))}
    order by ri.id
  `) as unknown as ItemRow[];

  const byReturn = new Map<number, ReturnRecordItem[]>();
  for (const { return_id, ...item } of items) {
    const list = byReturn.get(Number(return_id));
    const row: ReturnRecordItem = {
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      company_rate: item.company_rate == null ? null : Number(item.company_rate),
      line_remaining: Number(item.line_remaining),
    };
    if (list) list.push(row);
    else byReturn.set(Number(return_id), [row]);
  }

  return headers.map((h) => ({
    ...h,
    total_amount: Number(h.total_amount),
    company_amount: Number(h.company_amount),
    refund_amount: Number(h.refund_amount),
    order_total: Number(h.order_total),
    order_paid: Number(h.order_paid),
    items: byReturn.get(Number(h.id)) ?? [],
  }));
}


export function filterReturns(
  rows: ReturnRecord[],
  term: string,
): ReturnRecord[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.order_number.toLowerCase().includes(needle) ||
      r.party_name.toLowerCase().includes(needle) ||
      r.items.some((i) => i.product_name.toLowerCase().includes(needle)),
  );
}



type LineRow = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  effective_rate: number | null;
};

type ReturnItemRow = {
  id: number;
  order_item_id: number | null;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  company_rate: number | null;
};

type ReturnCore = {
  return_date: string;
  note?: string | undefined;
  refund: boolean;
  payment_method: "cash" | "bank";
};

export type ReturnActor = { userId: string | null; name: string | null };
export type AppliedReturn = {
  id: number;
  refund: number;
  orderId: number;
  partyId: number;
};
export type RevertedReturn = { orderId: number; partyId: number };

const sameRate = (a: number | null, b: number | null) =>
  a == null ? b == null : b != null && Number(a) === Number(b);

async function lockOrder(tx: TransactionSql, orderId: number) {
  const [order] = await tx`
    select id, party_id from orders where id = ${orderId} for update
  `;
  if (!order) throw new Error("Order not found");
  return { partyId: Number(order.party_id) };
}


async function lockLines(
  tx: TransactionSql,
  orderId: number,
): Promise<LineRow[]> {
  const rows = (await tx`
    select oi.id, oi.product_id, pr.name as product_name,
      oi.quantity, oi.unit_price,
      coalesce(oi.company_rate, pr.company_rate) as effective_rate
    from order_items oi
    join products pr on pr.id = oi.product_id
    where oi.order_id = ${orderId}
    order by oi.id
    for update of oi
  `) as unknown as LineRow[];
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    product_id: Number(r.product_id),
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    effective_rate: r.effective_rate == null ? null : Number(r.effective_rate),
  }));
}


async function restoreReturnLines(
  tx: TransactionSql,
  orderId: number,
  items: ReturnItemRow[],
  lines: LineRow[],
): Promise<{ lines: LineRow[]; landedOn: Map<number, number> }> {
  const working = lines.map((l) => ({ ...l }));
  const landedOn = new Map<number, number>();

  for (const item of items) {
    const quantity = Number(item.quantity);
    let target =
      item.order_item_id == null
        ? undefined
        : working.find((l) => l.id === Number(item.order_item_id));
    target ??= working.find(
      (l) =>
        l.product_id === Number(item.product_id) &&
        l.unit_price === Number(item.unit_price) &&
        sameRate(l.effective_rate, item.company_rate),
    );

    if (target) {
      const next = roundMoney(target.quantity + quantity);
      await tx`update order_items set quantity = ${next} where id = ${target.id}`;
      target.quantity = next;
    } else {
      const [row] = await tx`
        insert into order_items (order_id, product_id, quantity, unit_price, company_rate)
        values (${orderId}, ${Number(item.product_id)}, ${quantity},
                ${Number(item.unit_price)}, ${item.company_rate})
        returning id
      `;
      target = {
        id: Number(row.id),
        product_id: Number(item.product_id),
        product_name: item.product_name,
        quantity,
        unit_price: Number(item.unit_price),
        effective_rate: item.company_rate,
      };
      working.push(target);
    }
    landedOn.set(Number(item.id), target.id);
  }

  return { lines: working, landedOn };
}

async function lockReturnItems(
  tx: TransactionSql,
  returnId: number,
): Promise<ReturnItemRow[]> {
  const rows = (await tx`
    select ri.id, ri.order_item_id, ri.product_id, pr.name as product_name,
      ri.quantity, ri.unit_price, ri.company_rate
    from product_return_items ri
    join products pr on pr.id = ri.product_id
    where ri.return_id = ${returnId}
    order by ri.id
    for update of ri
  `) as unknown as ReturnItemRow[];
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    order_item_id: r.order_item_id == null ? null : Number(r.order_item_id),
    product_id: Number(r.product_id),
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    company_rate: r.company_rate == null ? null : Number(r.company_rate),
  }));
}


function foldQuantities(
  entries: { lineId: number; quantity: number }[],
): Map<number, number> {
  const wanted = new Map<number, number>();
  for (const e of entries) {
    if (e.quantity <= 0) continue;
    wanted.set(
      e.lineId,
      roundMoney((wanted.get(e.lineId) ?? 0) + e.quantity),
    );
  }
  return wanted;
}


async function settleReturn(
  tx: TransactionSql,
  ctx: {
    orderId: number;
    partyId: number;
    lines: LineRow[];
    wanted: Map<number, number>;
    input: ReturnCore;
    existingId: number | null;
    actor: ReturnActor;
  },
): Promise<AppliedReturn> {
  const { orderId, partyId, lines, wanted, input, existingId, actor } = ctx;
  const byId = new Map(lines.map((l) => [l.id, l]));

  let returnAmount = 0;
  let companyAmount = 0;
  for (const [lineId, qty] of wanted) {
    const line = byId.get(lineId);
    if (!line) {
      throw new Error(
        "That product is no longer on this order. Reload the page and try again.",
      );
    }
    const remaining = roundMoney(line.quantity);
    if (qty > remaining) {
      throw new Error(
        `Can't return ${qty} × ${line.product_name}: only ${remaining} left on this order.`,
      );
    }
    returnAmount += qty * line.unit_price;
    companyAmount += qty * (line.effective_rate ?? 0);
  }
  returnAmount = roundMoney(returnAmount);
  companyAmount = roundMoney(companyAmount);


  const newTotal = roundMoney(
    lines.reduce((sum, l) => {
      const left = Math.max(roundMoney(l.quantity - (wanted.get(l.id) ?? 0)), 0);
      return sum + left * l.unit_price;
    }, 0),
  );
  const [paidRow] = await tx`
    select coalesce(sum(amount), 0) as paid from payments where order_id = ${orderId}
  `;
  const paid = Number(paidRow?.paid ?? 0);
  const refund = input.refund
    ? computeRefundDue(newTotal, paid, returnAmount)
    : 0;


  let paymentId: number | null = null;
  if (refund > 0) {
    const [payment] = await tx`
      insert into payments (party_id, order_id, amount, payment_date, payment_method)
      values (${partyId}, ${orderId}, ${-refund}, ${input.return_date}, ${input.payment_method})
      returning id
    `;
    paymentId = payment.id as number;
  }

  let returnId: number;
  if (existingId == null) {
    const [ret] = await tx`
      insert into product_returns
        (order_id, return_date, total_amount, company_amount, refund_amount,
         payment_id, note, created_by, created_by_name)
      values
        (${orderId}, ${input.return_date}, ${returnAmount}, ${companyAmount}, ${refund},
         ${paymentId}, ${input.note ?? null}, ${actor.userId}, ${actor.name})
      returning id
    `;
    returnId = ret.id as number;
  } else {

    await tx`
      update product_returns
      set return_date = ${input.return_date},
          total_amount = ${returnAmount},
          company_amount = ${companyAmount},
          refund_amount = ${refund},
          payment_id = ${paymentId},
          note = ${input.note ?? null}
      where id = ${existingId}
    `;
    returnId = existingId;
  }


  for (const [lineId, qty] of wanted) {
    const line = byId.get(lineId)!;
    await tx`
      insert into product_return_items
        (return_id, order_item_id, product_id, quantity, unit_price, company_rate)
      values
        (${returnId}, ${lineId}, ${line.product_id}, ${qty},
         ${line.unit_price}, ${line.effective_rate})
    `;
  }


  for (const [lineId, qty] of wanted) {
    const line = byId.get(lineId)!;
    const left = roundMoney(line.quantity - qty);
    if (left <= 0) {
      await tx`delete from order_items where id = ${lineId}`;
    } else {
      await tx`update order_items set quantity = ${left} where id = ${lineId}`;
    }
  }

  return { id: returnId, refund, orderId, partyId };
}


export async function applyReturn(
  tx: TransactionSql,
  orderId: number,
  input: ReturnInput,
  actor: ReturnActor = { userId: null, name: null },
): Promise<AppliedReturn> {
  const wanted = foldQuantities(
    input.items.map((i) => ({
      lineId: i.order_item_id,
      quantity: i.quantity,
    })),
  );
  if (wanted.size === 0) {
    throw new Error("Enter a quantity for at least one product");
  }

  const { partyId } = await lockOrder(tx, orderId);
  const lines = await lockLines(tx, orderId);
  return settleReturn(tx, {
    orderId,
    partyId,
    lines,
    wanted,
    input,
    existingId: null,
    actor,
  });
}


export async function applyReturnEdit(
  tx: TransactionSql,
  input: ReturnEditInput,
): Promise<AppliedReturn> {
  const [existing] = await tx`
    select id, order_id, payment_id from product_returns
    where id = ${input.id} for update
  `;
  if (!existing) throw new Error("Return not found");
  const orderId = Number(existing.order_id);

  const { partyId } = await lockOrder(tx, orderId);
  const items = await lockReturnItems(tx, input.id);
  const { lines, landedOn } = await restoreReturnLines(
    tx,
    orderId,
    items,
    await lockLines(tx, orderId),
  );


  if (existing.payment_id != null) {
    await tx`delete from payments where id = ${Number(existing.payment_id)}`;
  }
  await tx`delete from product_return_items where return_id = ${input.id}`;

  const wanted = foldQuantities(
    input.items.map((i) => {
      const lineId = landedOn.get(i.return_item_id);
      if (lineId == null) {
        throw new Error(
          "That product is no longer part of this return. Reload the page and try again.",
        );
      }
      return { lineId, quantity: i.quantity };
    }),
  );
  if (wanted.size === 0) {
    throw new Error(
      "Enter a quantity for at least one product, or delete the return",
    );
  }

  return settleReturn(tx, {
    orderId,
    partyId,
    lines,
    wanted,
    input,
    existingId: input.id,
    actor: { userId: null, name: null },
  });
}


export async function revertReturn(
  tx: TransactionSql,
  returnId: number,
): Promise<RevertedReturn> {
  const [existing] = await tx`
    select id, order_id, payment_id from product_returns
    where id = ${returnId} for update
  `;
  if (!existing) throw new Error("Return not found");
  const orderId = Number(existing.order_id);

  const { partyId } = await lockOrder(tx, orderId);
  const items = await lockReturnItems(tx, returnId);
  await restoreReturnLines(tx, orderId, items, await lockLines(tx, orderId));

  if (existing.payment_id != null) {
    await tx`delete from payments where id = ${Number(existing.payment_id)}`;
  }
  // The items cascade with the header.
  await tx`delete from product_returns where id = ${returnId}`;

  return { orderId, partyId };
}
