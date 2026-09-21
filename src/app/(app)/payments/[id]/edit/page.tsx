import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import type { Payment } from "@/types";
import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "../../_components/payment-form";
import type { PartyOption } from "@/components/party-combobox";

export const dynamic = "force-dynamic";

export default async function EditPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [payment, parties] = await Promise.all([
    sql`select * from payments where id = ${Number(id)}` as unknown as Promise<
      Payment[]
    >,
    sql`select id, name, phone from parties order by name asc`,
  ]);

  if (!payment[0]) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit payment #${payment[0].id}`} />
      <PaymentForm
        parties={parties as unknown as PartyOption[]}
        payment={payment[0]}
      />
    </div>
  );
}
