import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, History } from "lucide-react";
import { sql } from "@/lib/db";
import type { Party, LedgerEntry, PaymentMethod } from "@/types";
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
import { SearchInput } from "@/components/search-input";
import { PaymentMethodBadge } from "@/components/payment-method-badge";
import { formatCurrency, formatDate, computePartyBalance } from "@/lib/utils";
import { deleteParty } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await sql`select name from parties where id = ${Number(id)}`;
  return { title: (rows[0]?.name as string) ?? "Party" };
}

export default async function PartyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ id: idStr }, { q }] = await Promise.all([params, searchParams]);
  const id = Number(idStr);
  const term = q?.trim() ?? "";
  const needle = term.toLowerCase();

  // Party, its orders (with computed totals), and payments — one parallel batch.
  const [partyRows, orders, payments] = await Promise.all([
    sql`select * from parties where id = ${id}` as unknown as Promise<Party[]>,
    sql`select o.id, o.order_number, o.order_date, o.created_at,
          coalesce((select sum(quantity * unit_price) from order_items where order_id = o.id), 0) as total,
          coalesce((select string_agg(lower(pr.name), ' | ')
                    from order_items oi join products pr on pr.id = oi.product_id
                    where oi.order_id = o.id), '') as products
        from orders o where o.party_id = ${id}` as unknown as Promise<
      {
        id: number;
        order_number: string;
        order_date: string;
        created_at: string;
        total: number;
        products: string; // lower-cased product names, for the search
      }[]
    >,
    sql`select id, amount, payment_date, payment_method, created_at
        from payments where party_id = ${id}` as unknown as Promise<
      {
        id: number;
        amount: number;
        payment_date: string;
        payment_method: PaymentMethod;
        created_at: string;
      }[]
    >,
  ]);

  const party = partyRows[0];
  if (!party) notFound();

  const ordersTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const accountBalance = computePartyBalance(
    Number(party.opening_balance),
    ordersTotal,
    paymentsTotal,
  );

  // Build the ledger: orders are debits (negative), payments credits (positive),
  // sorted oldest-first with a running balance starting at the opening balance
  // (opening balance = amount they owed us, so it starts as a debit).
  type Raw = {
    date: string;
    sortKey: string;
    type: "ORDER" | "PAYMENT";
    description: string;
    amount: number;
    link_id: number;
    method?: PaymentMethod;
    products: string;
  };
  const raw: Raw[] = [
    ...orders.map((o) => ({
      date: o.order_date,
      sortKey: o.order_date + o.created_at,
      type: "ORDER" as const,
      description: o.order_number,
      amount: -Number(o.total),
      link_id: o.id,
      products: o.products ?? "",
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      sortKey: p.payment_date + p.created_at,
      type: "PAYMENT" as const,
      // Negative rows are money going back out — a refund for returned goods,
      // or a paid figure corrected downwards from the company ledger.
      description: Number(p.amount) < 0 ? "Refund" : "Payment",
      amount: Number(p.amount),
      link_id: p.id,
      method: p.payment_method,
      products: "",
    })),
  ].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  // The running balance is always built over every entry, so each row keeps the
  // balance the account really stood at then. Searching only narrows what is
  // shown — it never re-runs the arithmetic over a subset.
  type LedgerRow = LedgerEntry & { products: string };
  const ledger: LedgerRow[] = raw.reduce<{
    items: LedgerRow[];
    running: number;
  }>(
    (state, e) => {
      const running = state.running + e.amount;
      state.items.push({
        date: e.date,
        type: e.type,
        description: e.description,
        amount: e.amount,
        balance_after: running,
        link_id: e.link_id,
        method: e.method,
        products: e.products,
      });
      return { items: state.items, running };
    },
    { items: [], running: -Number(party.opening_balance) },
  ).items;

  // A product search is a search for orders, so payments drop out of the view
  // while one is on — they carry no products to match.
  const visible = needle
    ? ledger.filter((e) => e.type === "ORDER" && e.products.includes(needle))
    : ledger;

  const due = accountBalance < 0;
  const settled = accountBalance === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={party.name}
        action={
          <>
            <Button asChild variant="outline">
              <a href="#history">
                <History className="size-4" /> History
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/party-history?party=${party.id}`}>
                <History className="size-4" /> Full History
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/parties/${party.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/parties">
                <ArrowLeft className="size-4" /> Back to Parties
              </Link>
            </Button>
            <DeleteButton
              action={deleteParty.bind(null, party.id)}
              label="Delete"
              variant="destructive"
              redirectTo="/parties"
              title={`Delete ${party.name}?`}
              description="This permanently removes the party. Parties with linked orders or payments can't be deleted."
            />
          </>
        }
      />

      <Card className="max-w-2xl">
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <Detail label="Name" value={party.name} />
          <Detail label="Phone" value={party.phone ?? "—"} />
          <Detail label="Address" value={party.address ?? "—"} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <div className="mt-1">
              <StatusBadge status={party.status} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account balance
            </p>
            <p
              className={`mt-1 text-2xl font-semibold ${due ? "text-red-600" : settled ? "" : "text-green-700"}`}
            >
              {formatCurrency(Math.abs(accountBalance))}{" "}
              <span className="text-sm font-normal">
                {due ? "(amount due)" : settled ? "(settled)" : "(advance/credit)"}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div id="history" className="scroll-mt-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">History</h2>
          <SearchInput
            defaultValue={term}
            placeholder="Search orders by product…"
          />
        </div>
        {term ? (
          <p className="text-sm text-muted-foreground">
            {visible.length} order{visible.length === 1 ? "" : "s"} with a
            product matching “{term}”. Payments are hidden while searching.
          </p>
        ) : null}
        <Card>
          {visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {term
                ? `No orders for ${party.name} include a product matching “${term}”.`
                : "No orders or payments yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((e, i) => (
                  <TableRow key={`${e.type}-${e.link_id}-${i}`}>
                    <TableCell>{formatDate(e.date)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.type === "ORDER"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {e.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {e.description}
                        {e.type === "PAYMENT" ? (
                          <PaymentMethodBadge method={e.method} />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${e.amount < 0 ? "text-red-600" : "text-green-700"}`}
                    >
                      {e.amount < 0 ? "−" : "+"}
                      {formatCurrency(Math.abs(e.amount))}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${e.balance_after < 0 ? "text-red-600" : e.balance_after > 0 ? "text-green-700" : ""}`}
                    >
                      {formatCurrency(Math.abs(e.balance_after))}
                      {e.balance_after < 0 ? " due" : e.balance_after > 0 ? " credit" : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={
                          e.type === "ORDER"
                            ? `/orders/${e.link_id}`
                            : `/payments/${e.link_id}`
                        }
                        className="text-sm text-purple-600 hover:underline"
                      >
                        {e.type === "ORDER" ? "View order" : "View payment"}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
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
