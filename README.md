# Catalyst

A B2B business‑management dashboard for a paint & chemical manufacturer (Pakistan).
Manage **Parties** (customers), **Products**, **Orders**, and **Payments**, with a
running‑balance ledger per party and printable internal invoices. Currency is
**PKR** throughout.

## Tech stack

| Concern    | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router, TypeScript, `src/`) — scaffolded via `create-next-app@latest` |
| Auth       | [Clerk](https://clerk.com) — signup, login, sessions, route protection via middleware |
| Database   | [Supabase](https://supabase.com) **Postgres only** (no Supabase Auth), accessed directly with [`postgres`](https://github.com/porsager/postgres) |
| Styling    | Tailwind CSS v4 (CSS‑based config), purple accent (`#7C3AED`) |
| Components | shadcn/ui‑style primitives in `src/components/ui` |
| Forms      | React Hook Form + Zod |
| Invoice    | Print‑optimized page via `window.print()` |
| CSV import | `papaparse` (bulk **party** import) |
| Dates      | `date-fns` / `Intl` |

> **Next version note:** `create-next-app@latest` installed **Next 16 / React 19 /
> Tailwind v4**, not Next 14. Conventions here (CSS‑based Tailwind config, async
> `params`/`searchParams`) follow the installed versions.

## Data model (integer IDs, no tax)

- **parties** — `name`, `phone`, `address`, `status` (active/inactive), `opening_balance`
- **products** — `name`, `unit_price`
- **orders** — `order_number` (`ORD-<timestamp>`), `party_id`, `order_date`, `status` (progress/completed), `advance_payment`
- **order_items** — `order_id`, `product_id`, `quantity`, `unit_price`
- **payments** — `party_id`, `order_id?`, `amount`, `payment_date`

Order total = `Σ(quantity × unit_price)`. Party account balance =
`opening_balance − Σ(order totals) + Σ(payments)` (negative = amount due, positive
= advance/credit). The advance payment entered on an order is recorded as a row in
`payments` (single source of truth for paid amounts and the party ledger).

## Getting started

### 1. Environment

Copy `.env.example` → `.env` and fill in your keys (Clerk + Supabase).

Supabase's **direct** connection (`db.<ref>.supabase.co`) is IPv6‑only, so this app
uses the **IPv4 session pooler** string (`aws-1-<region>.pooler.supabase.com:5432`,
user `postgres.<project-ref>`) — from the dashboard's **Connect → Session pooler**.

### 2. Database schema

```bash
npm run db:schema      # drops & recreates all tables, then applies the schema
npm run db:seed        # optional demo data (4 parties, 5 products, 1 order, 1 payment)
```

### 3. Run

```bash
npm run dev            # http://localhost:3000  → redirects to Clerk /sign-in
npm run build && npm run start
npm run typecheck
npx vercel --prod
```

## Pages

| Route | What |
|-------|------|
| `/` | Dashboard — greeting, date filter (7d / 30d / custom), 3 stat cards (payments received, orders + payment-status breakdown, parties + new), recent-activity feed |
| `/parties` | List + search; **Import from CSV**; **Add Party** |
| `/parties/new`, `/parties/[id]/edit` | Party form |
| `/parties/[id]` | Detail + **account balance** + **running-balance ledger** (orders as debits, payments as credits) |
| `/parties/import` | CSV import with downloadable template |
| `/products`, `/products/new`, `/products/[id]/edit` | Name + unit price |
| `/orders` | List (product/“N items”, order + payment status) |
| `/orders/new`, `/orders/[id]/edit` | Searchable customer combobox, dynamic items, advance-payment toggle, live total |
| `/orders/[id]` | Detail + items + payment summary + status toggle |
| `/orders/[id]/internal-invoice` | Print-optimized invoice (no sidebar; “Download PDF” = browser print) |
| `/payments`, `/payments/new`, `/payments/[id]`, `/payments/[id]/edit` | Party / amount / date |

## Project structure

```
db/schema.sql · seed.mjs · sample-parties.csv
src/
  types/index.ts          # domain types (Party, Product, Order, OrderItem, Payment, LedgerEntry, ActivityEntry)
  lib/db.ts               # postgres.js client (bigint/numeric/date parsed to JS values)
  lib/utils.ts            # PKR formatCurrency, formatDate, generateOrderNumber, compute* helpers
  lib/validation.ts       # Zod schemas
  components/             # ui/ primitives, sidebar, status-badge, delete-button, date-filter, print-button, skeletons
  app/
    layout.tsx            # ClerkProvider + Toaster
    sign-in, sign-up      # Clerk widgets
    (app)/                # authenticated area w/ sidebar; dashboard at /
    (print)/orders/[id]/internal-invoice  # invoice without the sidebar
    middleware.ts         # Clerk route protection
```

## Business rules

- Order number: `ORD-${Date.now()}`.
- Deletion: a party can’t be deleted while it has orders/payments; a product can’t
  be deleted while used in an order; deleting an order cascades its items and nulls
  `order_id` on linked payments; payments delete freely.
- Auth: Clerk protects everything except `/sign-in` and `/sign-up`; server actions
  re-assert `auth.protect()`.

> `src/middleware.ts` works but Next 16 prints a deprecation notice suggesting the
> new `proxy.ts` filename — Clerk still documents `middleware.ts`, so it’s kept.
