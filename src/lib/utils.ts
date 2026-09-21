import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merge helper (used by the UI primitives). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format PKR currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Format date for display
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format date + time for activity feeds
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Generate order number: ORD- + timestamp
export function generateOrderNumber(): string {
  return `ORD-${Date.now()}`;
}

// Compute order total from line items
export function computeOrderTotal(
  items: { quantity: number; unit_price: number }[],
): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

// Compute payment status
export function computePaymentStatus(
  orderTotal: number,
  advancePayment: number,
  paymentsTotal: number,
): "pending" | "partial" | "paid" {
  const totalPaid = advancePayment + paymentsTotal;
  if (totalPaid <= 0) return "pending";
  if (totalPaid < orderTotal) return "partial";
  return "paid";
}

// Compute party account balance.
// Orders are debits (subtract), payments are credits (add), matching the
// running-balance ledger on the party detail page. Per the spec's display
// rule: balance < 0 = amount due, balance >= 0 = advance/credit.
export function computePartyBalance(
  openingBalance: number,
  ordersTotal: number,
  paymentsTotal: number,
): number {
  // Opening balance is what the party already owed us, so it counts as a debit.
  return -openingBalance - ordersTotal + paymentsTotal;
}

// How one order's received money settles its share of the company bill.
//
// The buyer's money goes to the company first. Anything above that order's
// company bill is NOT kept as margin: it stays credited, so the surplus lowers
// what is still owed to the company overall. Per order the remaining therefore
// never drops below zero — the surplus surfaces in the day and grand totals
// instead, as a negative "To Pay" (an advance the company holds).
export function computeOrderCompanyCredit(
  bill: number,
  paid: number,
): { credit: number; remaining: number; surplus: number } {
  // A net refund can push an order's received money below zero; nothing is
  // credited to the company then.
  const credit = Math.max(paid, 0);
  return {
    credit,
    remaining: Math.max(bill - credit, 0),
    surplus: Math.max(credit - bill, 0),
  };
}

// Split a company bill into pending / advance. Paying more than the bill
// leaves an advance with the company, adjusted against future purchases.
export function computeLedgerBalance(bill: number, paid: number): {
  pending: number;
  advance: number;
  status: "paid" | "pending" | "advance";
} {
  const diff = bill - paid;
  return {
    pending: Math.max(diff, 0),
    advance: Math.max(-diff, 0),
    status: diff > 0 ? "pending" : diff < 0 ? "advance" : "paid",
  };
}

// Totals for company ledger rows. balance = billed − paid:
// positive = we still owe the company, negative = a credit the company holds.
//
// `directPaid` is money handed straight to the company (`company_payments`).
// It settles no single day's bill, so it never touches a day row, but it is
// real money paid and counts in Total Paid.
//
// Pending is deliberately the same figure as the balance rather than the sum
// of each day's shortfall: a day paid past its bill offsets a day that is
// short, so the two never disagree about what is outstanding.
export function summarizeLedger(
  rows: { bill: number; paid: number; orders: unknown[] }[],
  directPaid = 0,
) {
  const totals = { orderCount: 0, billed: 0, paid: 0 };
  for (const r of rows) {
    totals.orderCount += r.orders.length;
    totals.billed += r.bill;
    totals.paid += r.paid;
  }
  totals.paid += Math.max(directPaid, 0);
  const balance = totals.billed - totals.paid;
  return {
    ...totals,
    pending: balance,
    advance: Math.max(-balance, 0),
    balance,
  };
}
