import Link from "next/link";
import { Plus, CreditCard } from "lucide-react";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PaymentMethodBadge } from "@/components/payment-method-badge";
import type { PaymentMethod } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

type Row = {
  id: number;
  party_id: number;
  party_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
};

export default async function PaymentsPage() {
  const payments = (await sql`
    select pay.id, pay.party_id, p.name as party_name,
      pay.order_id, o.order_number, pay.amount, pay.payment_date, pay.payment_method
    from payments pay
    join parties p on p.id = pay.party_id
    left join orders o on o.id = pay.order_id
    order by pay.payment_date desc, pay.created_at desc
  `) as unknown as Row[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`${payments.length} payment${payments.length === 1 ? "" : "s"}`}
        action={
          <Button asChild>
            <Link href="/payments/new">
              <Plus className="size-4" /> Record Payment
            </Link>
          </Button>
        }
      />

      <Card>
        {payments.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="No payments yet"
            description="Record money received from your parties to keep balances up to date."
            action={
              <Button asChild>
                <Link href="/payments/new">
                  <Plus className="size-4" /> Record Payment
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/parties/${p.party_id}`}
                      className="hover:text-purple-600 hover:underline"
                    >
                      {p.party_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {p.order_number ? (
                      <Link
                        href={`/orders/${p.order_id}`}
                        className="text-purple-600 hover:underline"
                      >
                        {p.order_number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-green-700">
                    {formatCurrency(Number(p.amount))}
                  </TableCell>
                  <TableCell>
                    <PaymentMethodBadge method={p.payment_method} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/payments/${p.id}`}
                      className="hover:text-purple-600 hover:underline"
                    >
                      {formatDate(p.payment_date)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
