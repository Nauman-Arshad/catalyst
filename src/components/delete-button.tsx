"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

type Result = { ok: true } | { ok: false; error: string };

export function DeleteButton({
  action,
  title = "Delete this record?",
  description = "This action cannot be undone.",
  label,
  redirectTo,
  variant = "ghost",
}: {
  action: () => Promise<Result>;
  title?: string;
  description?: string;
  label?: string;
  redirectTo?: string;
  variant?: "ghost" | "outline" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success("Deleted");
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={variant}
        size={label ? "default" : "icon"}
        onClick={() => setOpen(true)}
        aria-label={label ?? "Delete"}
        className={
          variant === "destructive"
            ? undefined
            : "text-destructive hover:bg-destructive/10 hover:text-destructive"
        }
      >
        <Trash2 className="size-4" />
        {label ? <span>{label}</span> : null}
      </Button>

      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
