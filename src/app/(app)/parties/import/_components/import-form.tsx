"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { importParties } from "../../actions";

const TEMPLATE =
  "name,phone,address,opening_balance,status\n" +
  "Apex Hardware,+92 300 1234567,Saddar Karachi,0,active\n";

export function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parties-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setBusy(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        setBusy(false);
        const rows = results.data.filter((r) => (r.name ?? "").trim());
        if (rows.length === 0) {
          toast.error("No valid rows found (every row needs a name).");
          return;
        }
        startTransition(async () => {
          const res = await importParties(rows);
          if (res.ok) {
            toast.success(
              `Imported ${res.inserted} part${res.inserted === 1 ? "y" : "ies"}` +
                (res.skipped ? `, skipped ${res.skipped}` : ""),
            );
            router.push("/parties");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      },
      error: (err) => {
        setBusy(false);
        toast.error(`CSV parse error: ${err.message}`);
      },
    });
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-5 p-6">
        <p className="text-sm text-muted-foreground">
          Upload a CSV with columns <code className="text-foreground">name</code>,{" "}
          <code className="text-foreground">phone</code>,{" "}
          <code className="text-foreground">address</code>,{" "}
          <code className="text-foreground">opening_balance</code>,{" "}
          <code className="text-foreground">status</code>. Rows without a name are
          skipped. Need a starting point?{" "}
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1 text-purple-600 underline"
          >
            <Download className="size-3.5" /> download the CSV template
          </button>
          .
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || pending}
          >
            <Upload className="size-4" />
            {busy || pending ? "Importing…" : "Choose CSV & import"}
          </Button>
          {fileName ? (
            <span className="text-sm text-muted-foreground">{fileName}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
