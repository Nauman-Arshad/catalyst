import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, FileText, Undo2 } from "lucide-react";
import { sql } from "@/lib/db";
import { loadReturns } from "@/lib/returns";
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
import { EditReturnButton } from "../../returns/_components/edit-return-dialog";
import { deleteReturn } from "../../returns/actions";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  computePaymentStatus,
} from "@/lib/utils";
import { StatusSelect } from "../_components/status-select";
import { ReturnButton } from "../_components/return-dialog";
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

  const [partyRows, items, payRows, returns] = await Promise.all([
    sql`select * from parties where id = ${order.party_id}` as unknown as Promise<
      Party[]
    >,
    sql`
      select oi.id, oi.product_id, pr.name as product_name, oi.quantity, oi.unit_price
      from order_items oi join products pr on pr.id = oi.product_id
      where oi.order_id = ${id} order by oi.id
    ` as unknown as Promise<ItemRow[]>,
    sql`select coalesce(sum(amount), 0) as paid from payments where order_id = ${id}`,
    loadReturns(id),
  ]);

  const party = partyRows[0];
  const orderTotal = items.reduce(
    (s, it) => s + Number(it.quantity) * Number(it.unit_price),
    0,
  );
  const totalPaid = Number(payRows[0]?.paid ?? 0);
  const remaining = orderTotal - totalPaid;
  // The line items above are already net of every return, so this is history:
  // what the order originally carried, and how much of it went back.
  const returnedTotal = returns.reduce((s, r) => s + r.total_amount, 0);
  const refundedTotal = returns.reduce((s, r) => s + r.refund_amount, 0);
  const paymentStatus = computePaymentStatus(orderTotal, 0, totalPaid);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.order_number}`}
        action={
          <>
            <StatusSelect orderId={order.id} status={order.status} />
            <ReturnButton
              orderId={order.id}
              orderNumber={order.order_number}
              paid={totalPaid}
              lines={items.map((it) => ({
                id: it.id,
                product_name: it.product_name,
                quantity: Number(it.quantity),
                unit_price: Number(it.unit_price),
              }))}
            />
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
            {returnedTotal > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Returned</span>
                <span className="tabular-nums text-red-600">
                  −{formatCurrency(returnedTotal)}
                </span>
              </div>
            ) : null}
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
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Every item on this order has been returned.
                </TableCell>
              </TableRow>
            ) : null}
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

      {returns.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-1 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Undo2 className="size-4 text-muted-foreground" /> Returns
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCurrency(returnedTotal)} taken off this order
                {refundedTotal > 0
                  ? ` · ${formatCurrency(refundedTotal)} refunded`
                  : null}
              </p>
            </div>
            <Link
              href="/returns"
              className="text-sm text-purple-600 hover:underline"
            >
              All returns
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Products returned</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Processed by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap align-top">
                    {formatDate(r.return_date)}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    {r.items.map((it) => (
                      <span key={it.id} className="block">
                        <span className="tabular-nums font-medium">
                          {it.quantity}
                        </span>{" "}
                        × {it.product_name}
                      </span>
                    ))}
                    {r.note ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {r.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums text-red-600">
                    −{formatCurrency(r.total_amount)}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {r.created_by_name ?? "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-end gap-1">
                      <EditReturnButton record={r} />
                      <DeleteButton
                        action={deleteReturn.bind(null, r.id)}
                        title={`Delete this return of ${formatCurrency(r.total_amount)}?`}
                        description={`The ${r.items.map((i) => `${i.quantity} × ${i.product_name}`).join(", ")} goes back onto this order${r.refund_amount > 0 ? `, and the ${formatCurrency(r.refund_amount)} refunded for it is taken back off the customer's payments` : ""}. The order, the customer's balance and the company ledger return to what they were before this return.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
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
