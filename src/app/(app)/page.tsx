import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { Wallet, ClipboardList, Users, Eye } from "lucide-react";
import { sql } from "@/lib/db";
import type { ActivityEntry } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatDateTime,
  computePaymentStatus,
} from "@/lib/utils";
import { resolveRange, type DateRangeParams } from "@/lib/date-range";
import { DateFilter } from "./_components/date-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DateRangeParams>;
}) {
  const sp = await searchParams;
  const { from, to, active } = resolveRange(sp);
  
  const [user, received, periodOrders, partyRows, recentOrders, recentPayments, recentParties] =
    await Promise.all([
      currentUser(),
      sql`select coalesce(sum(amount), 0) as total
          from payments where payment_date between ${from} and ${to}` as unknown as Promise<
        { total: number }[]
      >,
      sql`select o.id,
            coalesce((select sum(quantity * unit_price) from order_items where order_id = o.id), 0) as total,
            coalesce((select sum(amount) from payments where order_id = o.id), 0) as paid
          from orders o where o.order_date between ${from} and ${to}` as unknown as Promise<
        { id: number; total: number; paid: number }[]
      >,
      sql`select
            (select count(*) from parties) as total,
            (select count(*) from parties where created_at::date between ${from} and ${to}) as new` as unknown as Promise<
        { total: number; new: number }[]
      >,
      sql`select o.id, o.order_number, o.created_at, o.party_id, p.name as party_name
          from orders o join parties p on p.id = o.party_id
          order by o.created_at desc limit 20` as unknown as Promise<
        { id: number; order_number: string; created_at: string; party_id: number; party_name: string }[]
      >,
      sql`select pay.id, pay.amount, pay.created_at, pay.party_id, p.name as party_name
          from payments pay join parties p on p.id = pay.party_id
          order by pay.created_at desc limit 20` as unknown as Promise<
        { id: number; amount: number; created_at: string; party_id: number; party_name: string }[]
      >,
      sql`select id, name, created_at from parties order by created_at desc limit 20` as unknown as Promise<
        { id: number; name: string; created_at: string }[]
      >,
    ]);

  const partyStats = partyRows[0];
  const breakdown = { pending: 0, partial: 0, paid: 0 };
  for (const o of periodOrders) {
    breakdown[computePaymentStatus(Number(o.total), 0, Number(o.paid))]++;
  }

  const activity: ActivityEntry[] = [
    ...recentOrders.map((o) => ({
      type: "ORDER" as const,
      record: o.order_number,
      details: `Order for ${o.party_name}`,
      date: o.created_at,
      href: `/orders/${o.id}`,
      party_id: o.party_id,
    })),
    ...recentPayments.map((p) => ({
      type: "PAYMENT" as const,
      record: `Payment #${p.id}`,
      details: `${formatCurrency(Number(p.amount))} from ${p.party_name}`,
      date: p.created_at,
      href: `/payments/${p.id}`,
      party_id: p.party_id,
    })),
    ...recentParties.map((p) => ({
      type: "PARTY" as const,
      record: p.name,
      details: "New party added",
      date: p.created_at,
      href: `/parties/${p.id}`,
      party_id: p.id,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);

  const typeBadge: Record<ActivityEntry["type"], string> = {
    PAYMENT: "bg-purple-100 text-purple-800",
    ORDER: "bg-blue-100 text-blue-800",
    PARTY: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greet()}, {user?.firstName ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </div>

      <DateFilter active={active} from={from} to={to} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Wallet className="size-5" />}
          tone="purple"
          label="Payments received"
          value={formatCurrency(Number(received[0]?.total ?? 0))}
          sub="in selected period"
        />
        <StatCard
          icon={<ClipboardList className="size-5" />}
          tone="blue"
          label="Orders"
          value={String(periodOrders.length)}
          sub={`${breakdown.paid} paid · ${breakdown.partial} partial · ${breakdown.pending} pending`}
          extra={
            <PaymentStatusBar
              paid={breakdown.paid}
              partial={breakdown.partial}
              pending={breakdown.pending}
            />
          }
        />
        <StatCard
          icon={<Users className="size-5" />}
          tone="green"
          label="Parties"
          value={String(Number(partyStats?.total ?? 0))}
          sub={`${Number(partyStats?.new ?? 0)} new in period`}
        />
      </div>

      <Card>
        <div className="border-b p-5">
          <h2 className="font-semibold">Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nothing here yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">History</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((a, i) => (
                <TableRow key={`${a.type}-${a.href}-${i}`}>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[a.type]}`}
                    >
                      {a.type}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={a.href} className="hover:text-purple-600 hover:underline">
                      {a.record}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.details}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(a.date)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button asChild variant="ghost" size="icon" className="size-8 text-purple-600">
                      <Link
                        href={`/party-history?party=${a.party_id}`}
                        aria-label="View party history"
                        title="View party history"
                      >
                        <Eye />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  sub,
  extra,
}: {
  icon: React.ReactNode;
  tone: "purple" | "blue" | "green";
  label: string;
  value: string;
  sub: string;
  extra?: React.ReactNode;
}) {
  const tones = {
    purple: "from-purple-50 to-white text-purple-600",
    blue: "from-blue-50 to-white text-blue-600",
    green: "from-green-50 to-white text-green-600",
  };
  return (
    <Card className={`bg-linear-to-br ${tones[tone]}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white shadow-sm">
            {icon}
          </div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
        </div>
        <p className="mt-4 text-2xl font-semibold text-gray-900">{value}</p>
        <p className="mt-1 text-xs text-gray-500">{sub}</p>
        {extra}
      </CardContent>
    </Card>
  );
}

function PaymentStatusBar({
  paid,
  partial,
  pending,
}: {
  paid: number;
  partial: number;
  pending: number;
}) {
  const total = paid + partial + pending;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-green-500" style={{ width: pct(paid) }} />
      <div className="bg-yellow-400" style={{ width: pct(partial) }} />
      <div className="bg-amber-500" style={{ width: pct(pending) }} />
    </div>
  );
}
