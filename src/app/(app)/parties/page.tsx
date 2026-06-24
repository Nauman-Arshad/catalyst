import Link from "next/link";
import { Plus, Upload, Users } from "lucide-react";
import { sql } from "@/lib/db";
import type { Party } from "@/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
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

export const dynamic = "force-dynamic";
export const metadata = { title: "Parties" };

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q?.trim();

  const parties = (term
    ? await sql`select * from parties where name ilike ${"%" + term + "%"} order by created_at desc`
    : await sql`select * from parties order by created_at desc`) as unknown as Party[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parties"
        description={`${parties.length} part${parties.length === 1 ? "y" : "ies"}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link href="/parties/import">
                <Upload className="size-4" /> Import from CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/parties/new">
                <Plus className="size-4" /> Add Party
              </Link>
            </Button>
          </>
        }
      />

      <SearchInput defaultValue={term} placeholder="Search by name…" />

      <Card>
        {parties.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={term ? "No parties match your search" : "No parties yet"}
            description={
              term
                ? "Try a different name."
                : "Add your customers to start creating orders and tracking balances."
            }
            action={
              term ? undefined : (
                <Button asChild>
                  <Link href="/parties/new">
                    <Plus className="size-4" /> Add Party
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/parties/${p.id}`}
                      className="hover:text-purple-600 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.phone ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {p.address ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
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
