import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import type { Order, OrderItem } from "@/types";
import { PageHeader } from "@/components/page-header";
import { OrderForm } from "../../_components/order-form";
import type { PartyOption } from "@/components/party-combobox";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  const orderRows = (await sql`select * from orders where id = ${id}`) as unknown as Order[];
  const order = orderRows[0];
  if (!order) notFound();

  const [items, parties, products] = await Promise.all([
    sql`select * from order_items where order_id = ${id} order by id` as unknown as Promise<
      OrderItem[]
    >,
    sql`select id, name, phone from parties order by name asc`,
    sql`select id, name, unit_price from products
        where deleted_at is null
           or id in (select product_id from order_items where order_id = ${id})
        order by name asc`,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${order.order_number}`} />
      <OrderForm
        parties={parties as unknown as PartyOption[]}
        products={
          products as unknown as { id: number; name: string; unit_price: number }[]
        }
        order={{
          id: order.id,
          party_id: order.party_id,
          order_date: order.order_date.slice(0, 10),
          status: order.status,
          advance_payment: order.advance_payment,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
        }}
      />
    </div>
  );
}
