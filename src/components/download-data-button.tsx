"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadDataButton({ format = "json", label = "Download My Data" }: {
  format?: "json" | "csv";
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const busy = useRef(false);

  async function download() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/my-data?format=${format}`, { cache: "no-store" });
      const contentType = format === "csv" ? "text/csv" : "application/json";
      if (!response.ok || !response.headers.get("content-type")?.includes(contentType)) {
        throw new Error(response.status === 401 || response.status === 404
          ? "Please sign in again to download your data."
          : "Unable to prepare your data. Please try again. If this continues, contact support.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = response.headers.get("content-disposition")?.match(/filename="(my-data-\d{4}-\d{2}-\d{2}\.(?:json|csv))"/)?.[1];
      link.download = filename ?? `my-data-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setFeedback({ error: false, text: "Your data is ready. Your download has started." });
    } catch (cause) {
      setFeedback({ error: true, text: cause instanceof Error ? cause.message : "Download failed. Please try again." });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={loading} aria-busy={loading} onClick={download}>
        {loading ? <Loader2 className="animate-spin" /> : <Download />}
        {loading ? "Preparing your data..." : label}
      </Button>
      {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "max-w-sm text-sm text-red-600" : "max-w-sm text-sm text-green-700"}>{feedback.text}</p>}
    </div>
  );
}
