import type postgres from "postgres";
import { randomUUID } from "node:crypto";
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
const historyColumns = ["tbl", "key", "old_user_id"] as const;
const fullCsvColumns = [...csvColumns, ...historyColumns];

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop spreadsheet formula execution.
  if (typeof value === "string" && /^(\s*[=+\-@]|[\t\r\n])/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function csvRow(table: string, row: Record<string, unknown>, exportedAt: string, columns = csvColumns): string {
  const values: Record<string, unknown> = { ...row, table, export_version: "1.0", exported_at: exportedAt };
  return columns.map((column) => csvCell(values[column])).join(",") + "\r\n";
}

type Identity = { id: string; email: string | null; name: string | null };
type FailureStage = "authentication" | "storage" | "database" | "role" | "tables" | "download";
type FailureDiagnostic = { reference: string; stage: FailureStage; code: string };

function safeErrorCode(cause: unknown): string {
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  // Never log the message, stack, SQL, error object, filesystem path, or user.
  return typeof code === "string" && (/^[0-9A-Z]{5}$/.test(code) || ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "CONNECT_TIMEOUT", "ETIMEDOUT", "EACCES", "ENOSPC", "EROFS"].includes(code)) ? code : "UNKNOWN";
}
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function createDataExportHandler({ sql, authenticate, scope = "user", authorizeFullExport = () => false, reportFailure = (diagnostic) => console.error("Data export failed", diagnostic) }: {
  sql: ReturnType<typeof postgres>;
  authenticate: () => Promise<Identity | null>;
  reportFailure?: (diagnostic: FailureDiagnostic) => void;
  scope?: "user" | "all";
  authorizeFullExport?: (userId: string) => boolean;
}) {
  return async function GET(request: Request): Promise<Response> {
    let stage: FailureStage = "authentication";
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
      // Full exports use a separate server-configured route, never a query flag.
      if (scope === "all" && !authorizeFullExport(user.id)) {
        return error("You are not authorized to export all application data.", 403);
      }
      if (request.headers.get("sec-fetch-site") === "cross-site") {
        return error("Please download your data from your account page.", 403);
      }

      const exportedAt = new Date().toISOString();
      const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
      const columnsForCsv = scope === "all" ? fullCsvColumns : csvColumns;
      const tables: Record<string, readonly string[]> = scope === "all"
        ? { ...exportTables, _user_reassign_backup_20260926: historyColumns }
        : exportTables;
      stage = "storage";
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
      stage = "database";
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        stage = "role";
        if (scope === "user") await tx`set local role catalyst_app`;
        await tx`set local row_security = on`;
        await tx`set local statement_timeout = '30s'`;
        await tx`set local idle_in_transaction_session_timeout = '30s'`;
        if (scope === "user") await tx`select set_config('app.current_user_id', ${user.id}, true)`;
        const [role] = await tx`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`;
        if (!role || (scope === "user" ? role.rolbypassrls || role.rolsuper : !role.rolbypassrls && !role.rolsuper)) throw new Error("Unsafe export role");
        stage = "tables";
        // Older deployed databases may never have had the ownership-history
        // table. Do not create it or fail the application backup on its absence.
        const unavailableTables: string[] = [];
        if (scope === "all") {
          const [history] = await tx`select to_regclass('public._user_reassign_backup_20260926')::text as history_table`;
          if (history?.history_table === null) {
            delete tables._user_reassign_backup_20260926;
            unavailableTables.push("_user_reassign_backup_20260926");
          }
        }

        if (format === "csv") {
          // A single rectangular CSV containing a source-table column. Include
          // the same minimal Clerk profile as JSON, even for an empty account.
          await write("\uFEFF" + columnsForCsv.map(csvCell).join(",") + "\r\n");
          await write(csvRow("user", { ...user, user_id: user.id }, exportedAt, columnsForCsv));
        } else {
          await write(JSON.stringify({ export_version: "1.0", exported_at: exportedAt, user, ...(scope === "all" ? { export_scope: "all_application_data", unavailable_tables: unavailableTables } : {}) }).slice(0, -1) + ',"data":{');
        }
        let firstTable = true;
        // Written after the data, so a file can be checked on its own and
        // restored table by table in this (parent-before-child) order.
        const manifest: Record<string, { rows: number; key: string; columns: readonly string[] }> = {};
        for (const [table, columns] of Object.entries(tables)) {
          if (format === "json") await write((firstTable ? "" : ",") + JSON.stringify(table) + ":[");
          firstTable = false;
          let firstRow = true;
          let rowCount = 0;
          const key = table === "_user_reassign_backup_20260926" ? "key" : table === "company_ledger_days" ? "ledger_date" : table === "company_ledger_order_paid" ? "order_id" : "id";
          // All live child tables have user_id; composite foreign keys enforce
          // the same owner on both sides. Export them independently so every
          // child is included without joins duplicating or omitting rows.
          // The callback cursor API does not await its final batch callback.
          // Iteration awaits every write before advancing or closing the file.
          const query = scope === "all"
            ? tx`select ${tx([...columns])} from public.${tx(table)} order by ${tx(key)}`
            : tx`select ${tx([...columns])} from public.${tx(table)} where user_id = ${user.id} order by ${tx(key)}`;
          for await (const rows of query.cursor(500)) {
            for (const row of rows) {
              if (scope === "user" && row.user_id !== user.id) throw new Error("Ownership mismatch");
              await write(format === "csv" ? csvRow(table, row, exportedAt, columnsForCsv) : (firstRow ? "" : ",") + JSON.stringify(row));
              firstRow = false;
              rowCount++;
            }
          }
          manifest[table] = { rows: rowCount, key, columns };
          if (format === "json") await write("]");
        }
        if (format === "json") await write("}," + JSON.stringify({ tables: manifest }).slice(1));
      });

      stage = "download";
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
          "Content-Disposition": `attachment; filename="${scope === "all" ? "all-application-data" : "my-data"}-${exportedAt.slice(0, 10)}.${format}"`,
        },
      });
    } catch (cause) {
      await cleanup().catch(() => {});
      const reference = randomUUID();
      // Only fixed stage names and allowlisted codes leave the exception path.
      const code = safeErrorCode(cause);
      try { reportFailure({ reference, stage, code }); } catch { /* Diagnostics must not break the safe error response. */ }
      // Database/Clerk errors can contain credentials or SQL: never return them.
      // The fixed stage name and allowlisted error code are safe to show, so a
      // failure can be diagnosed from the screen without server logs.
      return Response.json({
        error: "Unable to prepare your data. Please try again. If this continues, contact support.",
        reference,
        stage,
        code,
      }, { status: 500, headers: privateHeaders });
    }
  };
}
