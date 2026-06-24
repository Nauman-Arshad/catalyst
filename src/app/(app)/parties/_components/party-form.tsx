"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  partySchema,
  type PartyInput,
  type PartyFormValues,
} from "@/lib/validation";
import { createParty, updateParty } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { Party } from "@/types";

export function PartyForm({ party }: { party?: Party }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(party);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PartyFormValues, unknown, PartyInput>({
    resolver: zodResolver(partySchema),
    defaultValues: party
      ? {
          name: party.name,
          phone: party.phone ?? "",
          address: party.address ?? "",
          opening_balance: party.opening_balance,
          status: party.status,
        }
      : { status: "active", opening_balance: 0 },
  });

  function onSubmit(values: PartyInput) {
    startTransition(async () => {
      if (party) {
        const res = await updateParty(party.id, values);
        if (res.ok) {
          toast.success("Party updated");
          router.push(`/parties/${party.id}`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } else {
        const res = await createParty(values);
        if (res.ok) {
          toast.success("Party created");
          router.push(`/parties/${res.id}`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Party name *</Label>
            <Input placeholder="Apex Hardware & Paints" {...register("name")} />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+92 300 1234567" {...register("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea placeholder="Street, area, city…" {...register("address")} />
          </div>
          <div className="space-y-1.5">
            <Label>Opening balance (PKR)</Label>
            <Input
              type="number"
              step="0.01"
              {...register("opening_balance")}
            />
            <p className="text-xs text-muted-foreground">
              Remaining balance from before. Positive = they owe you, negative =
              advance/credit. Leave 0 if none.
            </p>
          </div>
          {isEdit ? (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select {...register("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Update Party" : "Create Party"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(party ? `/parties/${party.id}` : "/parties")
          }
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
