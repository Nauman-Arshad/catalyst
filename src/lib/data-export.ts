import type postgres from "postgres";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Audited against the live schema. Explicit columns prevent future secret
// columns or internal/backup tables from accidentally entering the export.
export const exportTables = {
  parties: ["id", "name", "phone", "address", "status", "opening_balance", "created_at", "user_id"],
  products: ["id", "name", "unit_price", "company_rate", "deleted_at", "created_at", "user_id"],
  orders: ["id", "order_number", "party_id", "order_date", "status", "advance_payment", "created_at", "user_id"],
  order_items: ["id", "order_id", "product_id", "quantity", "unit_price", "company_rate", "created_at", "user_id"],
  payments: ["id", "party_id", "order_id", "amount", "payment_date", "payment_method", "created_at", "user_id"],
  product_returns: ["id", "order_id", "return_date", "total_amount", "company_amount", "refund_amount", "payment_id", "note", "created_by", "created_by_name", "created_at", "user_id"],
  product_return_items: ["id", "return_id", "order_item_id", "product_id", "quantity", "unit_price", "company_rate", "created_at", "user_id"],
  companies: ["id", "name", "phone", "address", "created_at", "user_id"],
  company_purchases: ["id", "company_id", "product", "purchase_date", "bill_amount", "amount_paid", "notes", "created_at", "user_id"],
  company_ledger_days: ["ledger_date", "amount_paid", "updated_at", "user_id"],
  company_ledger_order_paid: ["order_id", "amount_paid", "updated_at", "user_id"],
  company_payments: ["id", "payment_date", "amount", "payment_method", "note", "created_at", "user_id"],
} as const;

const csvColumns = ["table", "export_version", "exported_at", ...new Set(Object.values(exportTables).flat()), "email"];

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop spreadsheet formula execution.
  if (typeof value === "string" && /^(\s*[=+\-@]|[\t\r\n])/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function csvRow(table: string, row: Record<string, unknown>, exportedAt: string): string {
  const values: Record<string, unknown> = { ...row, table, export_version: "1.0", exported_at: exportedAt };
  return csvColumns.map((column) => csvCell(values[column])).join(",") + "\r\n";
}

type Identity = { id: string; email: string | null; name: string | null };
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function createDataExportHandler({ sql, authenticate }: {
  sql: ReturnType<typeof postgres>;
  authenticate: () => Promise<Identity | null>;
}) {
  return async function GET(request: Request): Promise<Response> {
    let directory: string | undefined;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    const cleanup = async () => {
      await file?.close();
      file = undefined;
      if (directory) await rm(directory, { recursive: true, force: true });
      directory = undefined;
    };
    const error = (message: string, status: number) =>
      Response.json({ error: message }, { status, headers: privateHeaders });

    try {
      // No request-supplied identity is ever read, even when query parameters
      // or a body are sent. Clerk is the only identity source.
      const user = await authenticate();
      if (!user) return error("Please sign in to download your data.", 401);
      if (request.headers.get("sec-fetch-site") === "cross-site") {
        return error("Please download your data from your account page.", 403);
      }

      const exportedAt = new Date().toISOString();
      const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
      directory = await mkdtemp(join(tmpdir(), "catalyst-export-"));
      file = await open(join(directory, `data.${format}`), "wx+", 0o600);
      let size = 0;
      const deadline = Date.now() + 240_000;
      const write = async (text: string) => {
        request.signal.throwIfAborted();
        size += Buffer.byteLength(text);
        // Bound temporary storage and client Blob size. Never silently truncate.
        if (size > 128 * 1024 * 1024 || Date.now() > deadline) {
          throw new Error("Export resource limit exceeded");
        }
        await file!.writeFile(text);
      };

      // A complete consistent file is prepared before sending success headers,
      // so a failed query cannot produce an apparently successful partial JSON.
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        await tx`set local role catalyst_app`;
        await tx`set local row_security = on`;
        await tx`set local statement_timeout = '30s'`;
        await tx`set local idle_in_transaction_session_timeout = '30s'`;
        await tx`select set_config('app.current_user_id', ${user.id}, true)`;
        const [role] = await tx`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`;
        if (!role || role.rolbypassrls || role.rolsuper) throw new Error("Unsafe export role");

        if (format === "csv") {
          // A single rectangular CSV containing a source-table column. Include
          // the same minimal Clerk profile as JSON, even for an empty account.
          await write("\uFEFF" + csvColumns.map(csvCell).join(",") + "\r\n");
          await write(csvRow("user", { ...user, user_id: user.id }, exportedAt));
        } else {
          await write(JSON.stringify({ export_version: "1.0", exported_at: exportedAt, user }).slice(0, -1) + ',"data":{');
        }
        let firstTable = true;
        for (const [table, columns] of Object.entries(exportTables)) {
          if (format === "json") await write((firstTable ? "" : ",") + JSON.stringify(table) + ":[");
          firstTable = false;
          let firstRow = true;
          const key = table === "company_ledger_days" ? "ledger_date" : table === "company_ledger_order_paid" ? "order_id" : "id";
          // All live child tables have user_id; composite foreign keys enforce
          // the same owner on both sides. Export them independently so every
          // child is included without joins duplicating or omitting rows.
          await tx`select ${tx([...columns])} from public.${tx(table)}
            where user_id = ${user.id} order by ${tx(key)}`.cursor(500, async (rows) => {
            for (const row of rows) {
              if (row.user_id !== user.id) throw new Error("Ownership mismatch");
              await write(format === "csv" ? csvRow(table, row, exportedAt) : (firstRow ? "" : ",") + JSON.stringify(row));
              firstRow = false;
            }
          });
          if (format === "json") await write("]");
        }
        if (format === "json") await write("}}");
      });

      let position = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            request.signal.throwIfAborted();
            const buffer = Buffer.alloc(64 * 1024);
            const { bytesRead } = await file!.read(buffer, 0, buffer.length, position);
            if (!bytesRead) {
              await cleanup();
              controller.close();
              return;
            }
            position += bytesRead;
            controller.enqueue(buffer.subarray(0, bytesRead));
          } catch (cause) {
            await cleanup();
            controller.error(cause);
          }
        },
        cancel: cleanup,
      });
      return new Response(stream, {
        headers: {
          ...privateHeaders,
          "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
          "Content-Length": String(size),
          "Content-Disposition": `attachment; filename="my-data-${exportedAt.slice(0, 10)}.${format}"`,
        },
      });
    } catch {
      await cleanup();
      // Database/Clerk errors can contain credentials or SQL: never return them.
      return error("Unable to prepare your data. Please try again. If this continues, contact support.", 500);
    }
  };
}
