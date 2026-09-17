# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Catalyst is an internal B2B dashboard for a paint & chemical manufacturer in Pakistan. It tracks parties (customers), products, orders and payments. Money is PKR, and there is no tax.

## Commands

```bash
npm run dev          # http://localhost:3000 (redirects to Clerk /sign-in)
npm run build        # production build
npm run lint         # eslint (flat config, eslint-config-next)
npm run typecheck    # tsc --noEmit
npm run db:schema    # DESTRUCTIVE: drops and recreates every table from db/schema.sql (needs psql)
npm run db:seed      # demo data via db/seed.mjs
```

There is no test suite. Use `typecheck` + `lint` to check changes. The `db:*` scripts read `.env` through `node --env-file`.

## Stack notes

- **Next 16 / React 19 / Tailwind v4.** `params` and `searchParams` are async, and Tailwind is configured in CSS (`src/app/globals.css`), not a JS config file. `src/middleware.ts` shows a Next 16 deprecation warning (the new name is `proxy.ts`). It is kept as-is because Clerk's docs still use `middleware.ts`.
- **Auth is Clerk only.** The middleware protects every route except `/sign-in` and `/sign-up`, and every server action also calls `await auth.protect()` itself. Supabase Auth is not used.
- **The database is Supabase used as plain Postgres**, accessed through `postgres.js` in `src/lib/db.ts` (`server-only`). There is no ORM and no Supabase client. Write SQL with the `sql` template tag, and use `sql.begin(async (tx) => …)` for multi-statement writes.
  - `prepare: false` is required because the app goes through Supabase's pooler. The direct `db.<ref>.supabase.co` host is IPv6-only.
  - Custom type parsers: `bigint` and `numeric` come back as JS `number`, and `date` and `timestamp` come back as raw strings. Many call sites still wrap values in `Number(...)` to be safe.
- Vercel deploys to the `bom1` region (`vercel.json`).

## Architecture

- **Route groups:** `src/app/(app)/` wraps pages in `AppShell` (sidebar). `src/app/(print)/orders/[id]/internal-invoice` renders without the shell, and its "Download PDF" button is just `window.print()`.
- **Each area (`parties`, `products`, `orders`, `payments`) follows the same layout:**
  - `page.tsx`, `[id]/page.tsx`, `new/page.tsx` and `[id]/edit/page.tsx` are async Server Components that query `sql` directly. There is no API or data layer between them and the database.
  - `actions.ts` (`"use server"`) holds the mutations. Each one: `auth.protect()` → validate with the Zod schema from `src/lib/validation.ts` → run SQL → `revalidatePath(...)` on every affected list, detail and dashboard route → return `ActionResult` (`{ ok: true, id? } | { ok: false, error }`). Actions don't throw to the client.
  - `_components/*-form.tsx` are client forms built with React Hook Form + `zodResolver`. They share the Zod schema, call the action inside `startTransition`, and show results with `sonner` toasts.
  - Every route segment has a `loading.tsx` skeleton.
- **Shared code:** UI primitives (shadcn-style, Radix) are in `src/components/ui`. App-level components (sidebar, delete confirm dialog, search input, status badge, empty state) are in `src/components`. Domain types are in `src/types/index.ts`. Per-page `metadata.title` plugs into the root template `"%s · Catalyst"`.

## Domain rules (spread across schema, actions and pages)

- **Order totals** are `Σ(quantity × unit_price)` from `order_items`. The unit price is copied onto each line item, so later product price changes don't affect existing orders. Order numbers are `ORD-${Date.now()}`.
- **Advance payment:** `createOrder` stores `orders.advance_payment` and also inserts a matching `payments` row. The `payments` table is the single source of truth for what has been paid, so pages call `computePaymentStatus(total, 0, paid)` with advance = 0 to avoid counting it twice. Editing an order updates only the header and items (it deletes and re-inserts the items); the advance is never changed after creation.
- **Party balance sign convention** (`computePartyBalance` in `src/lib/utils.ts`): `opening_balance` is what the party already owed, so it counts as a debit. Balance = `-opening_balance - orders + payments`. **Negative = amount due, positive = advance/credit, zero = settled.** The running ledger on `parties/[id]/page.tsx` starts at `-opening_balance`, with orders as debits and payments as credits. Keep the util and the ledger consistent with each other.
- **Deletes follow the foreign-key rules in `db/schema.sql`:** parties and products are `on delete restrict` (they can't be deleted while referenced). `deleteProduct` works around this by archiving a product that orders still use (`products.deleted_at`); archived products are hidden from the product list and the new-order picker, but the order edit page still lists the ones already on that order. Deleting an order cascades to `order_items` and sets `order_id` to null on its payments. Payments can always be deleted.
- IDs are `bigint generated always as identity` (integers, not UUIDs).
- **Company ledger** (`/companies`) is for the single supplier company, with one row per day and no company CRUD. A day's bill is derived from that day's orders as `Σ(quantity × company_rate)`. `order_items.company_rate` is snapshotted from `products.company_rate` when an order is created, and `updateOrder` keeps existing snapshots. When a line item has no snapshot, the product's current rate is used, or 0 if it has none. Only the amount paid per day is stored (`company_ledger_days`). **Balance = bill − paid: positive = we owe the company, negative = advance it holds.** Data loading is in `companies/_lib/ledger.ts`. The PDF is a real file built with `@react-pdf/renderer` in `companies/pdf/route.ts`. Additive migrations live in `db/migrations/` (apply with `psql -f`; `db:schema` is destructive). The old `companies` / `company_purchases` tables are unused.

## Environment

`.env` needs `SUPABASE_CONNECTION_STRING` (the pooler URL) plus the Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the sign-in/up URL and redirect vars). The README mentions `.env.example`, but that file doesn't exist in the repo.
