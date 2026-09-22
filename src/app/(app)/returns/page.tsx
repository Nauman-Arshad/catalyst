import Link from "next/link";
import { Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { filterReturns, loadReturns } from "@/lib/returns";
import { EditReturnButton } from "./_components/edit-return-dialog";
import { deleteReturn } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Returns" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const returns = filterReturns(await loadReturns(), term);

  const returnedTotal = returns.reduce((s, r) => s + r.total_amount, 0);
  const refundedTotal = returns.reduce((s, r) => s + r.refund_amount, 0);
  const companyTotal = returns.reduce((s, r) => s + r.company_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Every product taken back off an order, with what it took off the bill."
      />

      <SearchInput
        defaultValue={term}
        placeholder="Search by order, party or product…"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Returns" value={String(returns.length)} />
        <Tile
          label="Value returned"
          value={formatCurrency(returnedTotal)}
          tone="text-red-600"
        />
        <Tile
          label="Refunded to customers"
          value={formatCurrency(refundedTotal)}
        />
      </div>

      <Card>
        {returns.length === 0 ? (
          <EmptyState
            icon={<Undo2 className="size-6" />}
            title={term ? "No matching returns" : "No returns yet"}
            description={
              term
                ? "Try a different order number, party or product."
                : "Use “Return Products” on an order to take goods back off it. Returns show up here with what they took off the order, the company bill and the customer's balance."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Party</TableHead>
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
                    <TableCell className="align-top font-medium">
                      <Link
                        href={`/orders/${r.order_id}`}
                        className="hover:text-purple-600 hover:underline"
                      >
                        {r.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        href={`/parties/${r.party_id}`}
                        className="hover:text-purple-600 hover:underline"
                      >
                        {r.party_name}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      {r.items.map((it) => (
                        <span key={it.id} className="block">
                          <span className="font-medium tabular-nums">
                            {it.quantity}
                          </span>{" "}
                          × {it.product_name}
                          <span className="text-muted-foreground">
                            {" "}
                            @ {formatCurrency(it.unit_price)}
                          </span>
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
                          description={`The ${r.items.map((i) => `${i.quantity} × ${i.product_name}`).join(", ")} goes back onto ${r.order_number}${r.refund_amount > 0 ? `, and the ${formatCurrency(r.refund_amount)} refunded for it is taken back off the customer's payments` : ""}. The order, the customer's balance and the company ledger return to what they were before this return.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CardContent className="flex justify-end gap-6 border-t p-5 text-sm">
              <span className="text-muted-foreground">
                Off company bills:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(companyTotal)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Value returned:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(returnedTotal)}
                </span>
              </span>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
