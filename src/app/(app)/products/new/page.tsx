import { PageHeader } from "@/components/page-header";
import { ProductForm } from "../_components/product-form";

export const metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New product" description="Add an item to your catalogue." />
      <ProductForm />
    </div>
  );
}
