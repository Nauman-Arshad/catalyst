import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/lib/db";
import type { Order, Party } from "@/types";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
};

export default async function InternalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  const orderRows = (await sql`select * from orders where id = ${id}`) as unknown as Order[];
  const order = orderRows[0];
  if (!order) notFound();

  const [partyRows, items, payRows] = await Promise.all([
    sql`select * from parties where id = ${order.party_id}` as unknown as Promise<
      Party[]
    >,
    sql`
      select oi.id, pr.name as product_name, oi.quantity, oi.unit_price
      from order_items oi join products pr on pr.id = oi.product_id
      where oi.order_id = ${id} order by oi.id
    ` as unknown as Promise<ItemRow[]>,
    sql`select coalesce(sum(amount), 0) as paid from payments where order_id = ${id}`,
  ]);

  const party = partyRows[0];
  const orderTotal = items.reduce(
    (s, it) => s + Number(it.quantity) * Number(it.unit_price),
    0,
  );
  const totalPaid = Number(payRows[0]?.paid ?? 0);
  const remaining = orderTotal - totalPaid;

  return (
    <main className="mx-auto max-w-3xl p-8 print:p-0">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Internal invoice</h1>
          <p className="text-sm text-muted-foreground">For internal records only</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild variant="ghost">
            <Link href={`/orders/${order.id}`}>
              <ArrowLeft className="size-4" /> Back to order
            </Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-8 print:border-0 print:p-0">
        <div className="grid grid-cols-2 gap-6 border-b pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order
            </p>
            <p className="mt-1 text-lg font-semibold">{order.order_number}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(order.order_date)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Party
            </p>
            <p className="mt-1 font-semibold">{party?.name ?? "—"}</p>
            {party?.phone ? (
              <p className="text-sm text-muted-foreground">{party.phone}</p>
            ) : null}
            {party?.address ? (
              <p className="text-sm text-muted-foreground">{party.address}</p>
            ) : null}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2">Item</th>
              <th className="pb-2 text-right">Quantity</th>
              <th className="pb-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2 font-medium">{it.product_name}</td>
                <td className="py-2 text-right tabular-nums">
                  {Number(it.quantity)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrency(Number(it.quantity) * Number(it.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Order total</span>
              <span className="tabular-nums">{formatCurrency(orderTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Advance payment</span>
              <span className="tabular-nums">
                {formatCurrency(order.advance_payment)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining amount</span>
              <span className="tabular-nums">{formatCurrency(remaining)}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
