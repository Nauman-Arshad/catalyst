"use client";

import { useState } from "react";
import { Download } from "lucide-react";

// "mine": the signed-in user's own rows. "all": every user's rows (administrators).
const modes = {
  mine: { url: "/api/my-data", file: "my-data", label: "Download My Data", busy: "Preparing your data…", status: "Preparing all of your records. Please keep this page open." },
  all: { url: "/api/backup/download", file: "catalyst-backup", label: "Download Complete Backup", busy: "Preparing your backup…", status: "Preparing all application records. Please keep this page open." },
};

export function DownloadBackupButton({ scope = "all" }: { scope?: keyof typeof modes }) {
  const mode = modes[scope];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(mode.url, { cache: "no-store" });
      // A signed-out session gets Clerk's HTML page (404), never JSON.
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Your session has expired. Please sign in again to download your backup.");
      }
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to prepare the backup. Please try again.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${mode.file}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the browser begin the download before releasing its Blob URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Your download has started. Keep this JSON file somewhere safe, such as Google Drive.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to download the backup.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" onClick={download} disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
      <Download className="size-4" />{busy ? mode.busy : mode.label}
    </button>
    {busy && <p role="status" className="mt-3 text-sm text-gray-600">{mode.status}</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </div>;
}
