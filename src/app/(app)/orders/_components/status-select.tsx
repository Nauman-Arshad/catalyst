"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { updateOrderStatus } from "../actions";

export function StatusSelect({
  orderId,
  status,
}: {
  orderId: number;
  status: "progress" | "completed";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Select
      className="w-44"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          const res = await updateOrderStatus(orderId, next);
          if (res.ok) {
            toast.success("Status updated");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
    >
      <option value="progress">In Progress</option>
      <option value="completed">Completed</option>
    </Select>
  );
}
