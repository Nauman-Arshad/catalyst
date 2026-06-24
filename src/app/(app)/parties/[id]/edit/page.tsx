import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import type { Party } from "@/types";
import { PageHeader } from "@/components/page-header";
import { PartyForm } from "../../_components/party-form";

export const dynamic = "force-dynamic";

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = (await sql`
    select * from parties where id = ${Number(id)}
  `) as unknown as Party[];
  const party = rows[0];
  if (!party) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Edit party" description={party.name} />
      <PartyForm party={party} />
    </div>
  );
}
