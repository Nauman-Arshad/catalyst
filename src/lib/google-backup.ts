import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const backupCookie = "catalyst-drive-backup";
export type BackupState = { userId: string; nonce: string; verifier: string; expires: number };

export function googleBackupConfig() {
  const clientId = process.env.GOOGLE_BACKUP_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_BACKUP_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_BACKUP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  const url = new URL(redirectUri);
  if (url.pathname !== "/api/backup/google/callback" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) return null;
  return { clientId, clientSecret, redirectUri, origin: url.origin };
}

export function signBackupState(state: BackupState, secret: string) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyBackupState(value: string, nonce: string, userId: string, secret: string): BackupState | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const expected = createHmac("sha256", secret).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const state = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as BackupState;
    return state.userId === userId && state.nonce === nonce && typeof state.verifier === "string" &&
      state.expires > Date.now() && state.expires <= Date.now() + 15 * 60_000 ? state : null;
  } catch { return null; }
}

export function createGoogleAuthorization(userId: string, email: string, config: NonNullable<ReturnType<typeof googleBackupConfig>>) {
  const state: BackupState = { userId, nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"), expires: Date.now() + 10 * 60_000 };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: "code", scope: "openid email https://www.googleapis.com/auth/drive.file",
    state: state.nonce, code_challenge: createHash("sha256").update(state.verifier).digest("base64url"),
    code_challenge_method: "S256", login_hint: email, prompt: "select_account consent", access_type: "online" }).toString();
  return { url: url.toString(), cookie: signBackupState(state, config.clientSecret) };
}

export function matchingBackupEmail(google: { email?: unknown; email_verified?: unknown }, clerkEmail: string) {
  return google.email_verified === true && typeof google.email === "string" &&
    google.email.toLowerCase() === clerkEmail.toLowerCase();
}

// Only upload-session URLs issued by the Google API may receive the snapshot.
export function validUploadUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "www.googleapis.com" &&
    url.pathname === "/upload/drive/v3/files" && !url.username && !url.password; } catch { return false; }
}
