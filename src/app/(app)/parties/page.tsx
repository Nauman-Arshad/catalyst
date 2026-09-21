import Link from "next/link";
import { Plus, Upload, Users } from "lucide-react";
import { sql } from "@/lib/db";
import type { Party } from "@/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { computePartyBalance, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parties" };

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q?.trim();

  // Each party carries its own order and payment totals so the list can show a
  // remaining balance without an N+1 of per-party queries.
  type PartyRow = Party & { orders_total: number; payments_total: number };

  const parties = (term
    ? await sql`select p.*,
          coalesce((select sum(oi.quantity * oi.unit_price)
                    from order_items oi join orders o on o.id = oi.order_id
                    where o.party_id = p.id), 0) as orders_total,
          coalesce((select sum(amount) from payments where party_id = p.id), 0) as payments_total
        from parties p
        where p.name ilike ${"%" + term + "%"}
        order by p.created_at desc`
    : await sql`select p.*,
          coalesce((select sum(oi.quantity * oi.unit_price)
                    from order_items oi join orders o on o.id = oi.order_id
                    where o.party_id = p.id), 0) as orders_total,
          coalesce((select sum(amount) from payments where party_id = p.id), 0) as payments_total
        from parties p
        order by p.created_at desc`) as unknown as PartyRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parties"
        description={`${parties.length} part${parties.length === 1 ? "y" : "ies"}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link href="/parties/import">
                <Upload className="size-4" /> Import from CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/parties/new">
                <Plus className="size-4" /> Add Party
              </Link>
            </Button>
          </>
        }
      />

      <SearchInput defaultValue={term} placeholder="Search by name…" />

      <Card>
        {parties.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={term ? "No parties match your search" : "No parties yet"}
            description={
              term
                ? "Try a different name."
                : "Add your customers to start creating orders and tracking balances."
            }
            action={
              term ? undefined : (
                <Button asChild>
                  <Link href="/parties/new">
                    <Plus className="size-4" /> Add Party
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Remaining Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parties.map((p) => {
                // Negative = amount due, positive = advance/credit, zero = settled.
                const balance = computePartyBalance(
                  Number(p.opening_balance),
                  Number(p.orders_total),
                  Number(p.payments_total),
                );
                const due = balance < 0;
                const settled = balance === 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/parties/${p.id}`}
                        className="hover:text-purple-600 hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.phone ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {p.address ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${due ? "text-red-600" : settled ? "text-muted-foreground" : "text-green-700"}`}
                    >
                      {formatCurrency(Math.abs(balance))}
                      <span className="ml-1 text-xs font-normal">
                        {due ? "due" : settled ? "settled" : "advance"}
                      </span>
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
