import { auth, currentUser } from "@clerk/nextjs/server";
import { unscopedSql } from "@/lib/db";
import { createDataExportHandler } from "@/lib/data-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every signed-in user can download their own rows. The handler switches to
// the catalyst_app role and the user's id itself, so row-level security
// limits the export to that user.
export const GET = createDataExportHandler({
  sql: unscopedSql,
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
