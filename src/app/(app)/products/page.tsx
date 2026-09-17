import Link from "next/link";
import { Plus, Pencil, Package } from "lucide-react";
import { sql } from "@/lib/db";
import type { Product } from "@/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { DeleteButton } from "@/components/delete-button";
import { deleteProduct } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q?.trim();

  const products = (term
    ? await sql`select * from products where deleted_at is null and name ilike ${"%" + term + "%"} order by name asc`
    : await sql`select * from products where deleted_at is null order by name asc`) as unknown as Product[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${products.length} product${products.length === 1 ? "" : "s"}`}
        action={
          <Button asChild>
            <Link href="/products/new">
              <Plus className="size-4" /> Add Product
            </Link>
          </Button>
        }
      />

      <SearchInput defaultValue={term} placeholder="Search by name…" />

      <Card>
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title={term ? "No products match your search" : "No products yet"}
            description={
              term
                ? "Try a different name."
                : "Add the items you sell so they're available when building orders."
            }
            action={
              term ? undefined : (
                <Button asChild>
                  <Link href="/products/new">
                    <Plus className="size-4" /> Add Product
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Company Rate</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/products/${p.id}/edit`}
                      className="hover:text-purple-600 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(p.unit_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.company_rate == null ? "—" : formatCurrency(Number(p.company_rate))}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/products/${p.id}/edit`}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteProduct.bind(null, p.id)}
                        title={`Delete ${p.name}?`}
                        description="It will be removed from your product list. Past orders that include it stay unchanged."
                      />
                    </div>
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
