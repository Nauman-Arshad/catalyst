import Link from "next/link";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "../_components/payment-form";
import type { PartyOption } from "@/components/party-combobox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record payment" };

export default async function NewPaymentPage() {
  const parties =
    await sql`select id, name, phone from parties order by name asc`;

  if (parties.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Record payment" />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Add a party first.
            <div className="mt-4">
              <Button asChild>
                <Link href="/parties/new">Add a party</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record payment"
        description="Log a payment from a party."
      />
      <PaymentForm parties={parties as unknown as PartyOption[]} />
    </div>
  );
}
