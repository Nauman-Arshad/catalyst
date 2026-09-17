import { createElement, type ReactElement } from "react";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { loadCompanyLedger } from "../_lib/ledger";
import { LedgerPdf } from "../_components/ledger-pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  await auth.protect();
  // Oldest first, like a statement.
  const days = (await loadCompanyLedger()).reverse();

  // LedgerPdf renders a <Document>, which is what renderToBuffer expects.
  const doc = createElement(LedgerPdf, { days }) as unknown as ReactElement<DocumentProps>;
  const pdf = await renderToBuffer(doc);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="company-ledger-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
