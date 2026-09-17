import Link from "next/link";
import { AlertTriangle, Building2, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cn,
  computeLedgerBalance,
  formatCurrency,
  formatDate,
  summarizeLedger,
} from "@/lib/utils";
import { loadCompanyLedger } from "./_lib/ledger";
import { EditPaidButton } from "./_components/edit-paid-button";
import { LedgerSummary } from "./_components/ledger-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Ledger" };

// Remaining to pay = bill − paid. Negative when paid in advance.
function toPayTone(n: number) {
  return n > 0 ? "text-red-600" : n < 0 ? "text-blue-700" : "text-muted-foreground";
}

export default async function CompanyLedgerPage() {
  const days = await loadCompanyLedger();
  const summary = summarizeLedger(days);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Ledger"
        description="Daily sales billed at company rates, and what you've paid the company."
      />

      <LedgerSummary summary={summary} />

      <Card>
        {days.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="No sales yet"
            description="Each day you create orders, that day's company bill appears here automatically."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead className="text-right">Total Bill</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">To Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((d) => {
                const b = computeLedgerBalance(d.bill, d.paid);
                const toPay = d.bill - d.paid;
                return (
                  <TableRow key={d.date}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(d.date)}
                    </TableCell>
                    <TableCell className="min-w-56">
                      {d.orders.length === 0 ? (
                        <span className="text-muted-foreground">No orders</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {d.orders.map((o) => (
                            <Link
                              key={o.id}
                              href={`/orders/${o.id}`}
                              title={o.order_number}
                              className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
                            >
                              {o.party_name}
                            </Link>
                          ))}
                        </div>
                      )}
                      {d.missing_rates > 0 ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="size-3" />
                          {d.missing_rates} item{d.missing_rates === 1 ? "" : "s"} without a
                          company rate (counted as 0)
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(d.bill)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">
                      {formatCurrency(d.paid)}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", toPayTone(toPay))}>
                      {formatCurrency(toPay)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditPaidButton date={d.date} bill={d.bill} paid={d.paid} />
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                <TableCell colSpan={2}>Totals</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(summary.billed)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-green-700">
                  {formatCurrency(summary.paid)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", toPayTone(summary.balance))}>
                  {formatCurrency(summary.balance)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Bill = quantity × company rate for each day&apos;s orders. To Pay = bill −
          paid; a negative amount is an advance you&apos;ve paid the company. Set company rates on
          the Products page.
        </p>
        <Button asChild size="lg" className="shrink-0">
          <a href="/companies/pdf" download>
            <Download className="size-4" /> Download PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
