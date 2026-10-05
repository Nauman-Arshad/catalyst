import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { createDataExportHandler } from "@/lib/data-export";
import { isDataExportAdmin } from "@/lib/export-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  let authorizedUserId: string | null = null;
  return createDataExportHandler({
  sql,
  scope: "all",
  authorizeFullExport: id => id === authorizedUserId,
  async authenticate() {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    if (!user || user.id !== userId) return null;
    const email = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
    if (isDataExportAdmin(userId, email)) authorizedUserId = userId;
    return {
      id: userId,
      email: user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    };
  },
  })(request);
}
