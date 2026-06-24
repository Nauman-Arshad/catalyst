import { PageHeader } from "@/components/page-header";
import { PartyForm } from "../_components/party-form";

export const metadata = { title: "New party" };

export default function NewPartyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New party" description="Add a customer." />
      <PartyForm />
    </div>
  );
}
