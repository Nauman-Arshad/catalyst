import { createElement, type ReactElement } from "react";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { resolveRange } from "@/lib/date-range";
import {
  filterCompanyPaymentsByDate,
  filterLedgerByDate,
  filterLedgerByParty,
  loadCompanyLedger,
  loadCompanyPayments,
} from "../_lib/ledger";
import { LedgerPdf } from "../_components/ledger-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await auth.protect();
  // Same company-name search and date range as the page, so the download
  // matches the screen.
  const params = new URL(request.url).searchParams;
  const term = params.get("q") ?? "";
  const { from, to } = resolveRange({
    range: params.get("range") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  // Oldest first, like a statement.
  const days = filterLedgerByDate(
    filterLedgerByParty(await loadCompanyLedger(), term),
    from,
    to,
  ).reverse();
  // Money paid straight to the company. Like the page, these follow the date
  // window only: a company-name search narrows the days, not what was paid.
  const payments = filterCompanyPaymentsByDate(
    await loadCompanyPayments(),
    from,
    to,
  );

  // LedgerPdf renders a <Document>, which is what renderToBuffer expects.
  const doc = createElement(LedgerPdf, {
    days,
    payments,
  }) as unknown as ReactElement<DocumentProps>;
  const pdf = await renderToBuffer(doc);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="company-ledger-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
