"use client";

import { useRouter } from "next/navigation";
import {
  PartyCombobox,
  type PartyOption,
} from "../../orders/_components/party-combobox";

export function PartyPicker({
  parties,
  value,
}: {
  parties: PartyOption[];
  value?: number;
}) {
  const router = useRouter();
  return (
    <div className="w-full sm:w-80">
      <PartyCombobox
        parties={parties}
        value={value}
        onChange={(id) => router.push(`/party-history?party=${id}`)}
      />
    </div>
  );
}
