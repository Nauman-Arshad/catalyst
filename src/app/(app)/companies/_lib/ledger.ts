import "server-only";
import { sql } from "@/lib/db";
import type { CompanyLedgerDay } from "@/types";

type OrderRow = {
  id: number;
  order_number: string;
  order_date: string;
  party_name: string;
  bill: number;
  missing_rates: number;
};

export async function loadCompanyLedger(): Promise<CompanyLedgerDay[]> {
  const [orders, paidRows] = await Promise.all([
    sql`
      select o.id, o.order_number, o.order_date, p.name as party_name,
        coalesce(sum(oi.quantity * coalesce(oi.company_rate, pr.company_rate, 0)), 0) as bill,
        count(oi.id) filter (where coalesce(oi.company_rate, pr.company_rate) is null) as missing_rates
      from orders o
      join parties p on p.id = o.party_id
      left join order_items oi on oi.order_id = o.id
      left join products pr on pr.id = oi.product_id
      group by o.id, p.name
      order by o.order_date desc, o.created_at asc
    ` as unknown as Promise<OrderRow[]>,
    sql`select ledger_date, amount_paid from company_ledger_days` as unknown as Promise<
      { ledger_date: string; amount_paid: number }[]
    >,
  ]);

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
    d.orders.push({ id: o.id, order_number: o.order_number, party_name: o.party_name });
    d.bill += Number(o.bill);
    d.missing_rates += Number(o.missing_rates);
  }
  for (const r of paidRows) day(r.ledger_date).paid = Number(r.amount_paid);

  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
