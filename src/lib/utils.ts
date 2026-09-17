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
// positive = we still owe the company, negative = advance the company holds.
export function summarizeLedger(
  rows: { bill: number; paid: number; orders: unknown[] }[],
) {
  const totals = { orderCount: 0, billed: 0, paid: 0, pending: 0, advance: 0 };
  for (const r of rows) {
    totals.orderCount += r.orders.length;
    const { pending, advance } = computeLedgerBalance(r.bill, r.paid);
    totals.billed += r.bill;
    totals.paid += r.paid;
    totals.pending += pending;
    totals.advance += advance;
  }
  return { ...totals, balance: totals.billed - totals.paid };
}
