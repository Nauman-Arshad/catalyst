import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { unscopedSql as sql } from "@/lib/db";
import { createDataExportHandler } from "@/lib/data-export";
import { isDataExportAdmin } from "@/lib/export-admin";
import { backupCookie, googleBackupConfig, matchingBackupEmail, validUploadUrl, verifyBackupState } from "@/lib/google-backup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const config = googleBackupConfig();
  if (!config) return Response.json({ error: "Google backup is not configured." }, { status: 503 });
  const finish = (status: string) => Response.redirect(new URL(`/backups?status=${status}`, config.origin), 303);
  const jar = await cookies();
  const cookie = jar.get(backupCookie)?.value;
  jar.delete({ name: backupCookie, path: "/api/backup/google" });
  let snapshot: Response | undefined;
  try {
    const { userId } = await auth();
    const params = new URL(request.url).searchParams;
    if (!userId || !isDataExportAdmin(userId) || !cookie ||
        !verifyBackupState(cookie, params.get("state") ?? "", userId, config.clientSecret)) return finish("invalid");
    if (params.has("error")) return finish("cancelled");
    const code = params.get("code");
    if (!code) return finish("invalid");
    const state = verifyBackupState(cookie, params.get("state")!, userId, config.clientSecret)!;
    const user = await currentUser();
    const email = user?.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
    if (user?.id !== userId || !email || email.verification?.status !== "verified") return finish("invalid");
    const fetchGoogle = (url: string, init: RequestInit = {}) => fetch(url, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    const exchange = await fetchGoogle("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({
      client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri,
      code, code_verifier: state.verifier, grant_type: "authorization_code",
    }) });
    if (!exchange.ok) return finish("failed");
    const token = await exchange.json();
    if (typeof token.access_token !== "string") return finish("failed");
    const authorization = { Authorization: `Bearer ${token.access_token}` };
    const identity = await fetchGoogle("https://openidconnect.googleapis.com/v1/userinfo", { headers: authorization });
    if (!identity.ok || !matchingBackupEmail(await identity.json(), email.emailAddress)) return finish("email-mismatch");
    // No database work occurs until both the administrator and destination are verified.
    snapshot = await createDataExportHandler({ sql, scope: "all", authorizeFullExport: isDataExportAdmin,
      authenticate: async () => ({ id: userId, email: email.emailAddress,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null }),
    })(new Request(new URL("/api/internal-backup", config.origin)));
    if (!snapshot.ok || !snapshot.body) return finish("failed");
    const size = snapshot.headers.get("content-length")!;
    const start = await fetchGoogle("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
      method: "POST", headers: { ...authorization, "Content-Type": "application/json",
        "X-Upload-Content-Type": "application/json", "X-Upload-Content-Length": size },
      body: JSON.stringify({ name: `catalyst-backup-${new Date().toISOString().replaceAll(":", "-")}.json`, mimeType: "application/json" }),
    });
    const uploadUrl = start.headers.get("location");
    if (!start.ok || !uploadUrl || !validUploadUrl(uploadUrl)) return finish("failed");
    const options: RequestInit & { duplex: "half" } = { method: "PUT", headers: { ...authorization,
      "Content-Type": "application/json", "Content-Length": size }, body: snapshot.body, duplex: "half" };
    const uploaded = await fetchGoogle(uploadUrl, options);
    return finish(uploaded.ok ? "saved" : "failed");
  } catch {
    // Never return or log OAuth tokens, account data, SQL, or provider errors.
    return finish("failed");
  } finally {
    if (snapshot?.body && !snapshot.body.locked) await snapshot.body.cancel().catch(() => {});
  }
}
