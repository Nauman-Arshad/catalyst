"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  productSchema,
  type ProductInput,
  type ProductFormValues,
} from "@/lib/validation";
import { createProduct, updateProduct } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { Product } from "@/types";

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          unit_price: product.unit_price,
          company_rate: product.company_rate ?? "",
        }
      : { unit_price: 0, company_rate: "" },
  });

  function onSubmit(values: ProductInput) {
    startTransition(async () => {
      const res = product
        ? await updateProduct(product.id, values)
        : await createProduct(values);
      if (res.ok) {
        toast.success(product ? "Product updated" : "Product created");
        router.push("/products");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Product name</Label>
            <Input placeholder="Premium White Emulsion" {...register("name")} />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Unit price (PKR)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("unit_price")}
            />
            {errors.unit_price ? (
              <p className="text-xs text-destructive">
                {errors.unit_price.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Company rate (PKR)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Optional"
              {...register("company_rate")}
            />
            <p className="text-xs text-muted-foreground">
              The rate you buy this product at from the company.
            </p>
            {errors.company_rate ? (
              <p className="text-xs text-destructive">
                {errors.company_rate.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : product ? "Update product" : "Create product"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
