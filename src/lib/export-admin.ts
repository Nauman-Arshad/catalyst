import "server-only";
import { backupAdminEmails, backupAdminUserIds } from "@/config/backup-admins";

// Explicit deployment-local allowlist. Never infer admin access from a name,
// email, query parameter, or editable Clerk metadata. Empty means deny everyone.
export function isDataExportAdmin(userId: string | null | undefined, primaryEmail?: {
  emailAddress: string;
  verification?: { status: string } | null;
}): boolean {
  if (!userId) return false;
  const allowedId = (process.env.DATA_EXPORT_ADMIN_USER_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean).includes(userId) || backupAdminUserIds.includes(userId);
  return allowedId || (primaryEmail?.verification?.status === "verified" &&
    backupAdminEmails.includes(primaryEmail.emailAddress.toLowerCase()));
}
