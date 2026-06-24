import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import type { Product } from "@/types";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "../../_components/product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = (await sql`
    select * from products where id = ${Number(id)}
  `) as unknown as Product[];
  const product = rows[0];
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Edit product" description={product.name} />
      <ProductForm product={product} />
    </div>
  );
}
