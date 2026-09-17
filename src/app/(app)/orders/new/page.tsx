import Link from "next/link";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderForm } from "../_components/order-form";
import type { PartyOption } from "../_components/party-combobox";

export const dynamic = "force-dynamic";
export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  const [parties, products] = await Promise.all([
    sql`select id, name, phone from parties where status = 'active' order by name asc`,
    sql`select id, name, unit_price from products where deleted_at is null order by name asc`,
  ]);

  if (parties.length === 0 || products.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="New order" />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You need at least one active party and one product before creating an
            order.
            <div className="mt-4 flex justify-center gap-3">
              <Button asChild variant="outline">
                <Link href="/parties/new">Add a party</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/products/new">Add a product</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New order" description="Add items and create the order." />
      <OrderForm
        parties={parties as unknown as PartyOption[]}
        products={
          products as unknown as { id: number; name: string; unit_price: number }[]
        }
      />
    </div>
  );
}
