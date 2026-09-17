"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { computeLedgerBalance, formatCurrency, formatDate } from "@/lib/utils";
import { setCompanyPaid } from "../actions";

export function EditPaidButton({
  date,
  bill,
  paid,
}: {
  date: string;
  bill: number;
  paid: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(paid));
  const [pending, startTransition] = useTransition();

  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  const preview = computeLedgerBalance(bill, valid ? amount : 0);

  function onOpenChange(next: boolean) {
    if (next) setValue(String(paid));
    setOpen(next);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    startTransition(async () => {
      const res = await setCompanyPaid({ ledger_date: date, amount_paid: amount });
      if (res.ok) {
        toast.success("Paid amount updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-purple-600"
        onClick={() => onOpenChange(true)}
        aria-label={`Edit paid amount for ${formatDate(date)}`}
        title="Edit paid amount"
      >
        <Pencil />
      </Button>

      <DialogContent>
        <form onSubmit={onSave} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Paid to company</DialogTitle>
            <DialogDescription>
              {formatDate(date)} · bill {formatCurrency(bill)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="amount_paid">Amount paid (PKR)</Label>
            <Input
              id="amount_paid"
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {!valid ? (
              <p className="text-xs text-destructive">Enter an amount ≥ 0</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {preview.status === "advance"
                  ? `Advance: ${formatCurrency(preview.advance)}`
                  : preview.status === "pending"
                    ? `Pending: ${formatCurrency(preview.pending)}`
                    : "Fully paid"}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
