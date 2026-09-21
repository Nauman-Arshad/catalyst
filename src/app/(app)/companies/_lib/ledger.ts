import "server-only";
import { sql } from "@/lib/db";
import { computeOrderCompanyCredit } from "@/lib/utils";
import type {
  CompanyLedgerDay,
  CompanyPayment,
  PaymentMethod,
} from "@/types";

type OrderRow = {
  id: number;
  order_number: string;
  order_date: string;
  created_at: string;
  party_name: string;
  party_id: number;
  bill: number;
  total: number;
  linked_paid: number;
  missing_rates: number;
};

type AllocatableOrder = {
  id: number;
  party_id: number;
  order_date: string;
  created_at: string;
  total: number;
  linked_paid: number;
};

/**
 * How much money each order has actually received.
 *
 * A payment row carries an `order_id` only when it was recorded against a
 * specific order; payments entered on the Payments page sit against the party
 * with `order_id` null. Those unlinked rupees are spread over that party's
 * orders oldest first, each order taking no more than what it is still short
 * of its sale total. Without this, money a buyer has plainly handed over never
 * reaches the day it belongs to.
 */
export function allocateReceived(
  orders: AllocatableOrder[],
  pools: Map<number, number>,
): Map<number, number> {
  const byParty = new Map<number, AllocatableOrder[]>();
  for (const o of orders) {
    const list = byParty.get(o.party_id);
    if (list) list.push(o);
    else byParty.set(o.party_id, [o]);
  }

  const received = new Map<number, number>();
  for (const [partyId, list] of byParty) {
    // Net refunds can push a pool below zero; there is nothing to spread then.
    let pool = Math.max(pools.get(partyId) ?? 0, 0);
    const oldestFirst = [...list].sort((a, b) =>
      a.order_date !== b.order_date
        ? a.order_date < b.order_date
          ? -1
          : 1
        : a.created_at < b.created_at
          ? -1
          : 1,
    );
    for (const o of oldestFirst) {
      const linked = Number(o.linked_paid);
      const take = Math.min(pool, Math.max(Number(o.total) - linked, 0));
      pool -= take;
      received.set(o.id, linked + take);
    }
  }
  return received;
}

export async function loadCompanyLedger(): Promise<CompanyLedgerDay[]> {
  const [orders, pools, methodRows] = await Promise.all([
    sql`
      select o.id, o.order_number, o.order_date, o.created_at,
        p.name as party_name, p.id as party_id,
        coalesce(sum(oi.quantity * coalesce(oi.company_rate, pr.company_rate, 0)), 0) as bill,
        coalesce(sum(oi.quantity * oi.unit_price), 0) as total,
        coalesce((select sum(amount) from payments where order_id = o.id), 0) as linked_paid,
        count(oi.id) filter (where coalesce(oi.company_rate, pr.company_rate) is null) as missing_rates
      from orders o
      join parties p on p.id = o.party_id
      left join order_items oi on oi.order_id = o.id
      left join products pr on pr.id = oi.product_id
      group by o.id, p.name, p.id
      order by o.order_date desc, o.created_at asc
    ` as unknown as Promise<OrderRow[]>,
    sql`
      select party_id, coalesce(sum(amount), 0) as pool
      from payments where order_id is null group by party_id
    ` as unknown as Promise<{ party_id: number; pool: number }[]>,
    // How the money against each order came in. Only payments that name an
    // order can be attributed; pool money is spread by `allocateReceived` and
    // belongs to no single method.
    sql`
      select order_id, payment_method
      from payments where order_id is not null
      group by order_id, payment_method
    ` as unknown as Promise<
      { order_id: number; payment_method: PaymentMethod }[]
    >,
  ]);

  const methodsByOrder = new Map<number, PaymentMethod[]>();
  for (const r of methodRows) {
    const id = Number(r.order_id);
    const list = methodsByOrder.get(id);
    if (list) list.push(r.payment_method);
    else methodsByOrder.set(id, [r.payment_method]);
  }
  // Stable order so the badges don't reshuffle between renders.
  const order: PaymentMethod[] = ["cash", "bank"];
  for (const list of methodsByOrder.values()) {
    list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  const received = allocateReceived(
    orders.map((o) => ({
      id: o.id,
      party_id: Number(o.party_id),
      order_date: o.order_date,
      created_at: o.created_at,
      total: Number(o.total),
      linked_paid: Number(o.linked_paid),
    })),
    new Map(pools.map((r) => [Number(r.party_id), Number(r.pool)])),
  );

  const days = new Map<string, CompanyLedgerDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, orders: [], bill: 0, paid: 0, missing_rates: 0 };
      days.set(date, d);
    }
    return d;
  };

  for (const o of orders) {
    const d = day(o.order_date);
    const bill = Number(o.bill);
    const paid = received.get(o.id) ?? Number(o.linked_paid);
    // The buyer's money settles this order's company bill first, and whatever
    // is over it stays credited rather than being written off as margin, so
    // the surplus comes off what is still owed to the company.
    const { credit } = computeOrderCompanyCredit(bill, paid);
    d.orders.push({
      id: o.id,
      order_number: o.order_number,
      party_name: o.party_name,
      party_id: Number(o.party_id),
      total: Number(o.total),
      paid,
      bill,
      credit,
      methods: methodsByOrder.get(o.id) ?? [],
    });
    d.bill += bill;
    d.paid += credit;
    d.missing_rates += Number(o.missing_rates);
  }

  return [...days.values()].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

/**
 * Money paid straight to the company, newest first. These sit outside the day
 * ledger: they belong to no single day's bill, so no day row moves when one is
 * recorded. They are still money paid, so the page adds them into Total Paid
 * and they come off Total Pending and the Company Balance.
 */
export async function loadCompanyPayments(): Promise<CompanyPayment[]> {
  const rows = (await sql`
    select id, payment_date, amount, payment_method, created_at
    from company_payments
    order by payment_date desc, created_at desc
  `) as unknown as CompanyPayment[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Total paid directly inside `from`..`to` (inclusive, `yyyy-MM-dd`). */
export function sumCompanyPayments(rows: CompanyPayment[]): number {
  return rows.reduce((s, r) => s + Number(r.amount), 0);
}

export function filterCompanyPaymentsByDate(
  rows: CompanyPayment[],
  from: string,
  to: string,
): CompanyPayment[] {
  return rows.filter((r) => r.payment_date >= from && r.payment_date <= to);
}

/**
 * What one order has received, using the same allocation as the ledger, so
 * editing a buyer's paid figure is measured against what the page shows.
 */
export async function receivedForOrder(
  orderId: number,
): Promise<{ partyId: number; received: number }> {
  const [order] = await sql`select party_id from orders where id = ${orderId}`;
  if (!order) throw new Error("Order not found");
  const partyId = Number(order.party_id);

  const [rows, [pool]] = await Promise.all([
    sql`
      select o.id, o.party_id, o.order_date, o.created_at,
        coalesce(sum(oi.quantity * oi.unit_price), 0) as total,
        coalesce((select sum(amount) from payments where order_id = o.id), 0) as linked_paid
      from orders o
      left join order_items oi on oi.order_id = o.id
      where o.party_id = ${partyId}
      group by o.id
    ` as unknown as Promise<AllocatableOrder[]>,
    sql`
      select coalesce(sum(amount), 0) as pool
      from payments where party_id = ${partyId} and order_id is null
    ` as unknown as Promise<{ pool: number }[]>,
  ]);

  const received = allocateReceived(
    rows.map((r) => ({
      id: Number(r.id),
      party_id: Number(r.party_id),
      order_date: r.order_date,
      created_at: r.created_at,
      total: Number(r.total),
      linked_paid: Number(r.linked_paid),
    })),
    new Map([[partyId, Number(pool.pool)]]),
  );
  return { partyId, received: received.get(orderId) ?? 0 };
}

/**
 * Keep only the days that have an order from a party whose name matches
 * `term` (case-insensitive, substring). An empty term returns every day.
 * Rows keep all of their orders so the money columns stay the day's real
 * totals; the page highlights the orders that matched.
 */
export function filterLedgerByParty(
  days: CompanyLedgerDay[],
  term: string,
): CompanyLedgerDay[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return days;
  return days.filter((d) =>
    d.orders.some((o) => o.party_name.toLowerCase().includes(needle)),
  );
}

/**
 * Keep only the days inside the `from`..`to` window (inclusive, `yyyy-MM-dd`).
 *
 * The window is applied after the ledger is built, never in SQL: the payment
 * allocation has to see every order a party has, or money spread over orders
 * outside the window would land on the wrong ones and the paid column would
 * change with the filter. Dates come back from Postgres as plain `yyyy-MM-dd`
 * strings, so comparing them as strings is the same as comparing dates.
 */
export function filterLedgerByDate(
  days: CompanyLedgerDay[],
  from: string,
  to: string,
): CompanyLedgerDay[] {
  return days.filter((d) => d.date >= from && d.date <= to);
}
