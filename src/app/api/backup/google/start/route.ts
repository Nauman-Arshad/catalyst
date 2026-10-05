import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { isDataExportAdmin } from "@/lib/export-admin";
import { backupCookie, createGoogleAuthorization, googleBackupConfig } from "@/lib/google-backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (!isDataExportAdmin(userId)) return Response.json({ error: "Only a configured administrator can back up all application data." }, { status: 403, headers });
  const config = googleBackupConfig();
  if (!config) return Response.json({ error: "Google Drive backup needs Google OAuth configuration. See docs/google-drive-backup.md." }, { status: 503, headers });
  if (request.headers.get("origin") !== config.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Start the backup from this application." }, { status: 403, headers });
  }
  const user = await currentUser();
  const email = user?.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  if (user?.id !== userId || !email || email.verification?.status !== "verified") {
    return Response.json({ error: "A verified primary account email is required." }, { status: 403, headers });
  }
  const authorization = createGoogleAuthorization(userId, email.emailAddress, config);
  (await cookies()).set(backupCookie, authorization.cookie, { httpOnly: true, secure: config.origin.startsWith("https:"),
    sameSite: "lax", path: "/api/backup/google", maxAge: 600 });
  return Response.json({ url: authorization.url }, { headers });
}
