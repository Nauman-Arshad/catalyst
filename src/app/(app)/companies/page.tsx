import Link from "next/link";
import { AlertTriangle, Building2, Download, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
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
  computeOrderCompanyCredit,
  formatCurrency,
  formatDate,
  formatDateTime,
  summarizeLedger,
} from "@/lib/utils";
import { resolveRange, type DateRangeParams } from "@/lib/date-range";
import { DateFilter } from "../_components/date-filter";
import {
  filterCompanyPaymentsByDate,
  filterLedgerByDate,
  filterLedgerByParty,
  loadCompanyLedger,
  loadCompanyPayments,
  sumCompanyPayments,
} from "./_lib/ledger";
import {
  AddPaymentButton,
  EditPaymentButton,
} from "./_components/company-payment-buttons";
import { DayPaidButton } from "./_components/day-paid-button";
import { DeleteButton } from "@/components/delete-button";
import { PaymentMethodBadge } from "@/components/payment-method-badge";
import { deleteCompanyPayment } from "./actions";
import { LedgerSummary } from "./_components/ledger-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Ledger" };

// Remaining to pay = bill − paid. Negative when more has been paid than billed.
function toPayTone(n: number) {
  return n > 0
    ? "text-red-600"
    : n < 0
      ? "text-blue-700"
      : "text-muted-foreground";
}

export default async function CompanyLedgerPage({
  searchParams,
}: {
  searchParams: Promise<DateRangeParams & { q?: string }>;
}) {
  const sp = await searchParams;
  const term = sp.q?.trim() ?? "";
  const needle = term.toLowerCase();
  const { from, to, active } = resolveRange(sp);

  // Search keeps the days a matching party ordered on, with that party's
  // orders highlighted; the money columns stay the day's real totals. The
  // date range then narrows those days to the selected period.
  const days = filterLedgerByDate(
    filterLedgerByParty(await loadCompanyLedger(), term),
    from,
    to,
  );
  // Money handed straight to the company belongs to no single day's bill, so
  // it gets its own rows rather than changing a day's Bill or To Pay — but it
  // is money paid, so its total goes into Total Paid and comes off Total
  // Pending and the Company Balance.
  const directPayments = filterCompanyPaymentsByDate(
    await loadCompanyPayments(),
    from,
    to,
  );
  const directPaid = sumCompanyPayments(directPayments);
  const summary = summarizeLedger(days, directPaid);

  // Day rows and direct-payment rows share one table, newest first.
  const rows = [
    ...days.map((d) => ({ kind: "day" as const, date: d.date, day: d })),
    ...directPayments.map((p) => ({
      kind: "payment" as const,
      date: p.payment_date,
      payment: p,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    // A payment sits under the day's own row when they share a date.
    return a.kind === b.kind ? 0 : a.kind === "day" ? -1 : 1;
  });
  // Keep the download showing exactly what is on screen.
  const pdfQuery = new URLSearchParams({ from, to });
  if (term) pdfQuery.set("q", term);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Ledger"
        description="Daily sales billed at company rates, and what you've paid the company."
        action={<AddPaymentButton />}
      />

      <SearchInput defaultValue={term} placeholder="Search by company name…" />

      <DateFilter active={active} from={from} to={to} />

      <LedgerSummary summary={summary} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title={
              term ? "No days match your search" : "No sales in this period"
            }
            description={
              term
                ? `No company named "${term}" has an order between ${formatDate(from)} and ${formatDate(to)}.`
                : `No orders between ${formatDate(from)} and ${formatDate(to)}. Pick a wider date range, or create an order and that day's company bill appears here automatically.`
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead className="text-right">Bill</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">To Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                if (row.kind === "payment") {
                  const a = row.payment;
                  return (
                    <TableRow key={`payment-${a.id}`} className="bg-green-50/40">
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatDate(a.payment_date)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          recorded {formatDateTime(a.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-64">
                        <span className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs">
                          <Wallet className="size-3 text-green-700" />
                          <span className="font-medium text-green-800">
                            Paid to company
                          </span>
                          <PaymentMethodBadge method={a.payment_method} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-green-700">
                        {formatCurrency(Number(a.amount))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell>
                        <StatusBadge status="paid" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end">
                          <EditPaymentButton payment={a} />
                          <DeleteButton
                            action={deleteCompanyPayment.bind(null, a.id)}
                            title="Remove this payment?"
                            description={`${formatCurrency(Number(a.amount))} recorded on ${formatDate(a.payment_date)}. This cannot be undone.`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const d = row.day;
                const b = computeLedgerBalance(d.bill, d.paid);
                const toPay = d.bill - d.paid;
                return (
                  <TableRow key={d.date}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(d.date)}
                    </TableCell>
                    <TableCell className="min-w-64">
                      {d.orders.length === 0 ? (
                        <span className="text-muted-foreground">No orders</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {d.orders.map((o) => {
                            // Everything here is at the company rate: the
                            // amount shown is this order's share of the day's
                            // company bill, and what is due is the part of it
                            // the buyer's payments have not covered yet. Once
                            // it is covered the due is zero, and any surplus
                            // comes off the day's To Pay instead.
                            const { remaining, surplus } =
                              computeOrderCompanyCredit(o.bill, o.paid);
                            const settled = remaining === 0;
                            const hit =
                              needle !== "" &&
                              o.party_name.toLowerCase().includes(needle);
                            return (
                              <Link
                                key={o.id}
                                href={`/orders/${o.id}`}
                                title={`${o.order_number} · sale ${formatCurrency(
                                  o.total,
                                )} · paid ${formatCurrency(o.paid)}`}
                                className={cn(
                                  "flex flex-col gap-0.5 rounded-md border px-2 py-1 text-xs transition-colors",
                                  settled
                                    ? "border-green-200 bg-green-50 hover:bg-green-100"
                                    : "border-purple-200 bg-purple-50 hover:bg-purple-100",
                                  hit && "ring-2 ring-amber-400",
                                  needle !== "" && !hit && "opacity-50",
                                )}
                              >
                                <span className="flex items-baseline justify-between gap-3">
                                  <span
                                    className={cn(
                                      "font-medium",
                                      settled
                                        ? "text-green-800"
                                        : "text-purple-800",
                                    )}
                                  >
                                    {o.party_name}
                                  </span>
                                  <span
                                    className={cn(
                                      "tabular-nums",
                                      settled
                                        ? "text-green-700"
                                        : "text-purple-700",
                                    )}
                                  >
                                    {formatCurrency(o.bill)}
                                  </span>
                                </span>
                                <span
                                  className={cn(
                                    "font-medium tabular-nums",
                                    remaining > 0
                                      ? "text-red-600"
                                      : "text-green-700",
                                  )}
                                >
                                  {remaining > 0
                                    ? `Due ${formatCurrency(remaining)}`
                                    : surplus > 0
                                      ? `Paid · ${formatCurrency(surplus)} off company`
                                      : "Paid"}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      {d.missing_rates > 0 ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="size-3" />
                          {d.missing_rates} item
                          {d.missing_rates === 1 ? "" : "s"} without a company
                          rate (counted as 0)
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(d.bill)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">
                      {formatCurrency(d.paid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        toPayTone(toPay),
                      )}
                    >
                      {formatCurrency(toPay)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DayPaidButton day={d} />
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
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    toPayTone(summary.balance),
                  )}
                >
                  {formatCurrency(summary.balance)}
                </TableCell>
                <TableCell colSpan={2} className="text-right">
                  {directPaid > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      incl. {formatCurrency(directPaid)} paid direct
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild size="lg" className="shrink-0">
          <a href={`/companies/pdf?${pdfQuery}`} download>
            <Download className="size-4" /> Download PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
