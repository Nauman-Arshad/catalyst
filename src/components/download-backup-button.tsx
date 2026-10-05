"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function DownloadBackupButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/backup/download", { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to prepare the backup. Please try again.");
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Please sign in again to download your backup.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `catalyst-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the browser begin the download before releasing its Blob URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Your backup download has started. You can upload this JSON file to Google Drive.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to download the backup.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" onClick={download} disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
      <Download className="size-4" />{busy ? "Preparing your backup…" : "Download Complete Backup"}
    </button>
    {busy && <p role="status" className="mt-3 text-sm text-gray-600">Preparing all application records. Please keep this page open.</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </div>;
}
