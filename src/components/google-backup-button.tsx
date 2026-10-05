"use client";
import { useState } from "react";
import { CloudUpload } from "lucide-react";

export function GoogleBackupButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function backup() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backup/google/start", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to connect Google Drive.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect Google Drive.");
      setBusy(false);
    }
  }
  return <div>
    <button type="button" onClick={backup} disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
      <CloudUpload className="size-4" />{busy ? "Connecting to Google Drive…" : "Back up to Google Drive"}
    </button>
    {busy && <p role="status" className="mt-3 text-sm text-gray-600">Choose your matching Google account. Preparing and uploading may take a few minutes.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </div>;
}
