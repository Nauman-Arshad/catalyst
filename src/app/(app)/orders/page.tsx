import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, computePaymentStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

type Row = {
  id: number;
  order_number: string;
  status: "progress" | "completed";
  party_id: number;
  party_name: string;
  item_count: number;
  first_product: string | null;
  total: number;
  paid: number;
};

export default async function OrdersPage() {
  const orders = (await sql`
    select o.id, o.order_number, o.status, o.party_id, p.name as party_name,
      (select count(*) from order_items where order_id = o.id) as item_count,
      (select pr.name from order_items oi join products pr on pr.id = oi.product_id
        where oi.order_id = o.id order by oi.id limit 1) as first_product,
      coalesce((select sum(quantity * unit_price) from order_items where order_id = o.id), 0) as total,
      coalesce((select sum(amount) from payments where order_id = o.id), 0) as paid
    from orders o
    join parties p on p.id = o.party_id
    order by o.created_at desc
  `) as unknown as Row[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
        action={
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="size-4" /> New Order
            </Link>
          </Button>
        }
      />

      <Card>
        {orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="No orders yet"
            description="Create an order to add line items, track payment status, and print invoices."
            action={
              <Button asChild>
                <Link href="/orders/new">
                  <Plus className="size-4" /> New Order
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead>Payment Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const paymentStatus = computePaymentStatus(
                  Number(o.total),
                  0,
                  Number(o.paid),
                );
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orders/${o.id}`}
                        className="hover:text-purple-600 hover:underline"
                      >
                        {o.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/parties/${o.party_id}`}
                        className="hover:text-purple-600 hover:underline"
                      >
                        {o.party_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {Number(o.item_count) > 1
                        ? `${o.item_count} items`
                        : (o.first_product ?? "—")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(o.total))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={paymentStatus} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
