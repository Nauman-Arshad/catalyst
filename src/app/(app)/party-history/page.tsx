import Link from "next/link";
import { History, Users } from "lucide-react";
import { sql } from "@/lib/db";
import type { Party, PaymentMethod } from "@/types";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { PaymentMethodBadge } from "@/components/payment-method-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  computePartyBalance,
  computePaymentStatus,
} from "@/lib/utils";
import type { PartyOption } from "@/components/party-combobox";
import { PartyPicker } from "./_components/party-picker";

export const dynamic = "force-dynamic";

// The title doubles as the default PDF filename in the browser's print dialog.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ party?: string }>;
}) {
  const { party } = await searchParams;
  const id = Number(party);
  if (!Number.isInteger(id) || id <= 0) return { title: "Party History" };
  const rows = await sql`select name from parties where id = ${id}`;
  const name = rows[0]?.name as string | undefined;
  return { title: name ? `${name} — Party History` : "Party History" };
}

type OrderRow = {
  id: number;
  order_number: string;
  order_date: string;
  status: "progress" | "completed";
  advance_payment: number;
  total: number;
  paid: number;
  items: {
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
};

type PaymentRow = {
  id: number;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  order_id: number | null;
  order_number: string | null;
};

export default async function PartyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string }>;
}) {
  const { party: partyParam } = await searchParams;
  const partyId = Number(partyParam);
  const hasParty = Number.isInteger(partyId) && partyId > 0;

  const parties = (await sql`
    select id, name, phone from parties order by lower(name)
  `) as unknown as PartyOption[];

  const header = (
    <PageHeader
      title="Party History"
      description="Complete party details with every order and payment."
      action={
        <div className="print:hidden">
          <PartyPicker parties={parties} value={hasParty ? partyId : undefined} />
        </div>
      }
    />
  );

  if (!hasParty) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<History className="size-6" />}
            title="Select a party"
            description="Pick a party above to see its details and full transaction history."
          />
        </Card>
      </div>
    );
  }

  const [partyRows, orders, payments] = await Promise.all([
    sql`select * from parties where id = ${partyId}` as unknown as Promise<
      Party[]
    >,
    sql`select o.id, o.order_number, o.order_date, o.status, o.advance_payment,
          coalesce((select sum(quantity * unit_price) from order_items where order_id = o.id), 0) as total,
          coalesce((select sum(amount) from payments where order_id = o.id), 0) as paid,
          coalesce((
            select json_agg(json_build_object(
                     'id', oi.id, 'product_id', oi.product_id, 'product_name', pr.name,
                     'quantity', oi.quantity, 'unit_price', oi.unit_price
                   ) order by oi.id)
            from order_items oi join products pr on pr.id = oi.product_id
            where oi.order_id = o.id
          ), '[]'::json) as items
        from orders o
        where o.party_id = ${partyId}
        order by o.order_date desc, o.created_at desc` as unknown as Promise<
      OrderRow[]
    >,
    sql`select pay.id, pay.amount, pay.payment_date, pay.payment_method,
               pay.order_id, o.order_number
        from payments pay
        left join orders o on o.id = pay.order_id
        where pay.party_id = ${partyId}
        order by pay.payment_date desc, pay.created_at desc` as unknown as Promise<
      PaymentRow[]
    >,
  ]);

  const party = partyRows[0];
  if (!party) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title="Party not found"
            description="This party may have been deleted. Pick another party above."
          />
        </Card>
      </div>
    );
  }

  const ordersTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = computePartyBalance(
    Number(party.opening_balance),
    ordersTotal,
    paymentsTotal,
  );
  const due = balance < 0;
  const settled = balance === 0;

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Name">
            <Link
              href={`/parties/${party.id}`}
              className="font-medium hover:text-purple-600 hover:underline"
            >
              {party.name}
            </Link>
          </Detail>
          <Detail label="Phone">{party.phone ?? "—"}</Detail>
          <Detail label="Address">{party.address ?? "—"}</Detail>
          <Detail label="Status">
            <StatusBadge status={party.status} />
          </Detail>
          <Detail label="Customer since">
            {formatDateTime(party.created_at)}
          </Detail>
          <Detail label="Opening balance (owed)">
            {formatCurrency(Number(party.opening_balance))}
          </Detail>
          <Detail label="Total orders">{orders.length}</Detail>
          <Detail label="Total payments">{payments.length}</Detail>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Ordered" value={formatCurrency(ordersTotal)} />
        <Stat label="Paid" value={formatCurrency(paymentsTotal)} />
        <Stat
          label="Account balance"
          value={formatCurrency(Math.abs(balance))}
          note={due ? "amount due" : settled ? "settled" : "advance/credit"}
          className={due ? "text-red-600" : settled ? "" : "text-green-700"}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        {orders.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-sm text-muted-foreground">
              No orders yet.
            </div>
          </Card>
        ) : (
          orders.map((o) => {
            const total = Number(o.total);
            const paid = Number(o.paid);
            return (
              <Card key={o.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
                  <div>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium hover:text-purple-600 hover:underline"
                    >
                      {o.order_number}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(o.order_date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={o.status} />
                    <StatusBadge status={computePaymentStatus(total, 0, paid)} />
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(item.unit_price))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(
                            Number(item.quantity) * Number(item.unit_price),
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t px-6 py-3 text-sm tabular-nums">
                  <span>
                    Total: <strong>{formatCurrency(total)}</strong>
                  </span>
                  <span>
                    Advance: {formatCurrency(Number(o.advance_payment))}
                  </span>
                  <span className="text-green-700">
                    Paid: {formatCurrency(paid)}
                  </span>
                  <span className={total - paid > 0 ? "text-red-600" : ""}>
                    Remaining: {formatCurrency(Math.max(total - paid, 0))}
                  </span>
                </div>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        <Card>
          {payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No payments yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Against Order</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell>
                      {p.order_id ? (
                        <Link
                          href={`/orders/${p.order_id}`}
                          className="hover:text-purple-600 hover:underline"
                        >
                          {p.order_number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">On account</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PaymentMethodBadge method={p.payment_method} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">
                      {formatCurrency(Number(p.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/payments/${p.id}`}
                        className="text-sm text-purple-600 hover:underline"
                      >
                        View payment
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <p className="hidden text-xs text-muted-foreground print:block">
        Generated {formatDateTime(new Date().toISOString())}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button asChild variant="outline">
          <Link href={`/parties/${party.id}#history`}>
            <History className="size-4" /> View running ledger
          </Link>
        </Button>
        <PrintButton />
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${className ?? ""}`}>
          {value}
        </p>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
