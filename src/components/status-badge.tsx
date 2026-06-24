import { cn } from "@/lib/utils";

export type Status =
  | "active"
  | "inactive"
  | "pending"
  | "partial"
  | "paid"
  | "progress"
  | "completed";

const variants: Record<Status, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-800",
  partial: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
};

const labels: Record<Status, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  partial: "Partial",
  paid: "Paid",
  progress: "In Progress",
  completed: "Completed",
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        variants[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
