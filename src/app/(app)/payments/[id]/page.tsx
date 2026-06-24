import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deletePayment } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Payment #${id}` };
}

type Row = {
  id: number;
  party_id: number;
  party_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: number;
  payment_date: string;
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  const rows = (await sql`
    select pay.id, pay.party_id, p.name as party_name,
      pay.order_id, o.order_number, pay.amount, pay.payment_date
    from payments pay
    join parties p on p.id = pay.party_id
    left join orders o on o.id = pay.order_id
    where pay.id = ${id}
  `) as unknown as Row[];
  const payment = rows[0];
  if (!payment) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payment #${payment.id}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link href={`/payments/${payment.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/payments">
                <ArrowLeft className="size-4" /> Back to Payments
              </Link>
            </Button>
            <DeleteButton
              action={deletePayment.bind(null, payment.id)}
              label="Delete"
              variant="destructive"
              redirectTo="/payments"
              title="Delete this payment?"
              description="This cannot be undone."
            />
          </>
        }
      />

      <Card className="max-w-xl">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Party
            </p>
            <p className="mt-1">
              <Link
                href={`/parties/${payment.party_id}`}
                className="text-purple-600 hover:underline"
              >
                {payment.party_name}
              </Link>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order
            </p>
            <p className="mt-1">
              {payment.order_number ? (
                <Link
                  href={`/orders/${payment.order_id}`}
                  className="text-purple-600 hover:underline"
                >
                  {payment.order_number}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Amount
            </p>
            <p className="mt-1 text-2xl font-semibold text-green-700">
              {formatCurrency(Number(payment.amount))}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Payment date
            </p>
            <p className="mt-1">{formatDate(payment.payment_date)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
