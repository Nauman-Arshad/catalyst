import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, FileText } from "lucide-react";
import { sql } from "@/lib/db";
import type { Order, Party } from "@/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency, formatDate, computePaymentStatus } from "@/lib/utils";
import { StatusSelect } from "../_components/status-select";
import { deleteOrder } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await sql`select order_number from orders where id = ${Number(id)}`;
  return { title: (rows[0]?.order_number as string) ?? "Order" };
}

type ItemRow = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
};

export default async function OrderDetailPage({
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
      select oi.id, oi.product_id, pr.name as product_name, oi.quantity, oi.unit_price
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
  const paymentStatus = computePaymentStatus(orderTotal, 0, totalPaid);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.order_number}`}
        action={
          <>
            <StatusSelect orderId={order.id} status={order.status} />
            <Button asChild variant="outline">
              <Link href={`/orders/${order.id}/internal-invoice`}>
                <FileText className="size-4" /> Internal invoice
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/orders/${order.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/orders">
                <ArrowLeft className="size-4" /> Back to Orders
              </Link>
            </Button>
            <DeleteButton
              action={deleteOrder.bind(null, order.id)}
              label="Delete"
              variant="destructive"
              redirectTo="/orders"
              title={`Delete order ${order.order_number}?`}
              description="The order, its line items, and its link to any payments will be removed. This cannot be undone."
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Detail label="Order number" value={order.order_number} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Party
              </p>
              <p className="mt-1">
                <Link
                  href={`/parties/${order.party_id}`}
                  className="text-purple-600 hover:underline"
                >
                  {party?.name ?? "—"}
                </Link>
              </p>
            </div>
            <Detail label="Order date" value={formatDate(order.order_date)} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Order status
              </p>
              <div className="mt-1">
                <StatusBadge status={order.status} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <h3 className="font-semibold">Payment summary</h3>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order total</span>
              <span className="tabular-nums">{formatCurrency(orderTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Advance payment</span>
              <span className="tabular-nums">
                {formatCurrency(order.advance_payment)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total paid</span>
              <span className="tabular-nums text-green-700">
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Remaining amount</span>
              <span className="tabular-nums">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">Payment status</span>
              <StatusBadge status={paymentStatus} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="border-b p-5">
          <h2 className="font-semibold">Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.product_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(it.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(it.unit_price))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(it.quantity) * Number(it.unit_price))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="flex justify-end border-t p-5">
          <div className="text-right">
            <span className="text-sm text-muted-foreground">Order total: </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(orderTotal)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
