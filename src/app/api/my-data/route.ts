import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { createDataExportHandler } from "@/lib/data-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = createDataExportHandler({
  sql,
  async authenticate() {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    if (!user || user.id !== userId) return null;
    return {
      id: userId,
      email: user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null,
    };
  },
});
