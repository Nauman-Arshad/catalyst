import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ImportForm } from "./_components/import-form";

export const metadata = { title: "Import parties" };

export default function ImportPartiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import parties"
        description="Bulk-add customers from a CSV file."
        action={
          <Button asChild variant="ghost">
            <Link href="/parties">
              <ArrowLeft className="size-4" /> Back to Parties
            </Link>
          </Button>
        }
      />
      <ImportForm />
    </div>
  );
}
