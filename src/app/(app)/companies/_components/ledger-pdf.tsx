import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CompanyLedgerDay } from "@/types";
import {
  computeLedgerBalance,
  formatCurrency,
  formatDate,
  formatDateTime,
  summarizeLedger,
} from "@/lib/utils";

const purple = "#7c3aed";
const border = "#e5e7eb";
const muted = "#6b7280";
const red = "#dc2626";
const green = "#15803d";
const blue = "#1d4ed8";

const amount = (n: number) =>
  n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: purple,
    paddingBottom: 10,
  },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: purple },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  meta: { fontSize: 8, color: muted, textAlign: "right" },
  company: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 10,
    backgroundColor: "#f5f3ff",
    borderRadius: 4,
  },
  label: {
    fontSize: 7,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  summary: { flexDirection: "row", marginTop: 12, gap: 6 },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 4,
    padding: 7,
  },
  tileValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tileSub: { fontSize: 6.5, color: muted, marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: border,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  headRow: { backgroundColor: purple, borderBottomWidth: 0 },
  headCell: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  zebra: { backgroundColor: "#fafafa" },
  totalRow: {
    backgroundColor: "#f5f3ff",
    borderBottomWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: purple,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  cDate: { width: 62, paddingRight: 4 },
  cOrders: { flex: 1, paddingRight: 6 },
  cMoney: { width: 70, textAlign: "right", paddingLeft: 4 },
  cStatus: { width: 50, textAlign: "center" },
  notes: { fontSize: 7, color: muted, marginTop: 1 },
  pill: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1.5,
    borderRadius: 6,
    textAlign: "center",
  },
  note: { fontSize: 7.5, color: muted, marginTop: 8 },
  empty: { padding: 16, textAlign: "center", color: muted },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: muted,
  },
});

const pills = {
  paid: { label: "PAID", color: green, backgroundColor: "#dcfce7" },
  pending: { label: "PENDING", color: "#b45309", backgroundColor: "#fef3c7" },
  advance: { label: "ADVANCE", color: blue, backgroundColor: "#dbeafe" },
} as const;

export function LedgerPdf({ days }: { days: CompanyLedgerDay[] }) {
  const summary = summarizeLedger(days);
  const bal = summary.balance;
  const balanceLabel =
    bal > 0 ? "Payable to company" : bal < 0 ? "Advance with company" : "Settled";
  const balanceColor = bal > 0 ? red : bal < 0 ? blue : green;
  const period =
    days.length > 0
      ? `${formatDate(days[0].date)} - ${formatDate(days[days.length - 1].date)}`
      : "No sales recorded";

  const tiles = [
    { label: "Total orders", value: String(summary.orderCount) },
    { label: "Total billed", value: formatCurrency(summary.billed) },
    { label: "Total paid", value: formatCurrency(summary.paid), color: green },
    {
      label: "Total pending",
      value: formatCurrency(summary.pending),
      color: summary.pending > 0 ? red : undefined,
    },
    {
      label: "Company balance",
      value: formatCurrency(bal),
      color: balanceColor,
      sub: balanceLabel,
    },
  ];

  return (
    <Document title="Company Ledger" author="Catalyst">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.brand}>Catalyst</Text>
            <Text style={s.title}>Company Ledger</Text>
          </View>
          <View>
            <Text style={s.meta}>Daily sales at company rates & payments</Text>
            <Text style={s.meta}>
              Generated {formatDateTime(new Date().toISOString())}
            </Text>
          </View>
        </View>

        <View style={s.company}>
          <View>
            <Text style={s.label}>Period</Text>
            <Text style={s.companyName}>{period}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.label}>{balanceLabel}</Text>
            <Text style={[s.companyName, { color: balanceColor, fontSize: 15 }]}>
              {formatCurrency(bal)}
            </Text>
          </View>
        </View>

        <View style={s.summary}>
          {tiles.map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={s.label}>{t.label}</Text>
              <Text style={[s.tileValue, t.color ? { color: t.color } : {}]}>
                {t.value}
              </Text>
              {t.sub ? <Text style={s.tileSub}>{t.sub}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Daily records</Text>

        <View style={[s.row, s.headRow]}>
          <Text style={[s.cDate, s.headCell]}>DATE</Text>
          <Text style={[s.cOrders, s.headCell]}>ORDERS</Text>
          <Text style={[s.cMoney, s.headCell]}>BILL (PKR)</Text>
          <Text style={[s.cMoney, s.headCell]}>PAID</Text>
          <Text style={[s.cMoney, s.headCell]}>TO PAY</Text>
          <Text style={[s.cStatus, s.headCell]}>STATUS</Text>
        </View>

        {days.length === 0 ? (
          <Text style={s.empty}>No sales recorded.</Text>
        ) : (
          days.map((d, i) => {
            const b = computeLedgerBalance(d.bill, d.paid);
            const pill = pills[b.status];
            return (
              <View
                key={d.date}
                style={i % 2 === 1 ? [s.row, s.zebra] : s.row}
                wrap={false}
              >
                <Text style={s.cDate}>{formatDate(d.date)}</Text>
                <View style={s.cOrders}>
                  <Text style={s.bold}>
                    {d.orders.length > 0
                      ? d.orders.map((o) => o.party_name).join(", ")
                      : "No orders"}
                  </Text>
                  {d.orders.length > 0 ? (
                    <Text style={s.notes}>
                      {d.orders.map((o) => o.order_number).join(", ")}
                    </Text>
                  ) : null}
                  {d.missing_rates > 0 ? (
                    <Text style={[s.notes, { color: "#b45309" }]}>
                      {d.missing_rates} item(s) without a company rate
                    </Text>
                  ) : null}
                </View>
                <Text style={s.cMoney}>{amount(d.bill)}</Text>
                <Text style={[s.cMoney, { color: green }]}>{amount(d.paid)}</Text>
                <Text
                  style={[
                    s.cMoney,
                    s.bold,
                    { color: d.bill > d.paid ? red : d.bill < d.paid ? blue : muted },
                  ]}
                >
                  {amount(d.bill - d.paid)}
                </Text>
                <View style={[s.cStatus, { paddingHorizontal: 4 }]}>
                  <Text
                    style={[
                      s.pill,
                      { color: pill.color, backgroundColor: pill.backgroundColor },
                    ]}
                  >
                    {pill.label}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {days.length > 0 ? (
          <View style={[s.row, s.totalRow]} wrap={false}>
            <Text style={[s.cDate, s.bold]}>TOTAL</Text>
            <Text style={[s.cOrders, s.bold]}>
              {summary.orderCount} order{summary.orderCount === 1 ? "" : "s"}
            </Text>
            <Text style={[s.cMoney, s.bold]}>{amount(summary.billed)}</Text>
            <Text style={[s.cMoney, s.bold, { color: green }]}>
              {amount(summary.paid)}
            </Text>
            <Text style={[s.cMoney, s.bold, { color: balanceColor }]}>
              {amount(bal)}
            </Text>
            <Text style={s.cStatus} />
          </View>
        ) : null}

        <Text style={s.note}>
          {"Bill = quantity x company rate for each day's orders. To pay = bill - paid; a " +
            "negative amount is an advance paid to the company and will be adjusted against " +
            "future purchases."}
        </Text>

        <View style={s.footer} fixed>
          <Text>Catalyst · Company Ledger</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
