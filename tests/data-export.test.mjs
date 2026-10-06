import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import ts from "typescript";
import postgres from "postgres";
import Papa from "papaparse";

// Compile the actual handler without Next.js or a running Clerk session.
const source = await readFile(new URL("../src/lib/data-export.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createDataExportHandler, exportTables, csvCell } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const identity = (id) => ({ id, email: null, name: null });
const noDatabase = { begin() { throw new Error("Database must not be accessed"); } };
const request = (suffix = "", options) => new Request(`http://localhost/api/backup/download${suffix}`, options);
const tempExports = async () => (await readdir(tmpdir())).filter((name) => name.startsWith("catalyst-export-")).sort();
const adminExport = (options) => createDataExportHandler({ authorizeFullExport: () => true, ...options });

test("unauthenticated and non-admin requests are rejected before accessing the database", async () => {
  const anonymous = await createDataExportHandler({ sql: noDatabase, authenticate: async () => null })(request("?user_id=user_admin&admin=true"));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("cache-control"), /no-store/);
  const ordinary = await createDataExportHandler({ sql: noDatabase, authenticate: async () => identity("ordinary-user"), authorizeFullExport: (id) => id === "user_admin" })(request("?user_id=user_admin&admin=true"));
  assert.equal(ordinary.status, 403);
  const unconfigured = await createDataExportHandler({ sql: noDatabase, authenticate: async () => identity("user_admin") })(request());
  assert.equal(unconfigured.status, 403);
});

test("cross-site exports are rejected", async () => {
  const response = await adminExport({ sql: noDatabase, authenticate: async () => identity("user_admin") })(request("", { headers: { "sec-fetch-site": "cross-site" } }));
  assert.equal(response.status, 403);
});

test("authentication and database failures are sanitized and temporary files removed", async () => {
  const before = await tempExports();
  for (const authenticate of [async () => { throw new Error("CLERK_SECRET_KEY=secret"); }, async () => identity("user_admin")]) {
    const response = await adminExport({ sql: noDatabase, authenticate })(request());
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /CLERK_SECRET_KEY|Database must/);
  }
  assert.deepEqual(await tempExports(), before);
});

test("failure diagnostics expose only reference, fixed stage, and safe code", async () => {
  for (const code of ["42501", "ENOTFOUND", "password=must-not-leak"]) {
    const diagnostics = [];
    const response = await adminExport({
      sql: { begin() { throw Object.assign(new Error("postgres://user:password@private-host SQL secret"), { code }); } },
      authenticate: async () => identity("private-user-id"),
      reportFailure: (diagnostic) => diagnostics.push(diagnostic),
    })(request());
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.match(body.reference, /^[0-9a-f-]{36}$/);
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(diagnostics[0], { reference: body.reference, stage: "database", code: code === "password=must-not-leak" ? "UNKNOWN" : code });
    assert.doesNotMatch(JSON.stringify({ body, diagnostics }), /postgres:|password|private-host|private-user-id|SQL secret/);
  }
});

test("export manifest excludes backup tables and secret columns", () => {
  assert.equal(Object.keys(exportTables).length, 12);
  for (const [table, columns] of Object.entries(exportTables)) {
    assert.doesNotMatch(table, /backup|auth|secret/);
    assert.ok(columns.includes("user_id"));
    assert.ok(!columns.some((column) => /password|token|api_key|secret|metadata/i.test(column)));
  }
});

function fixtureDatabase({ bypassRls = true, omitTables, dropColumns } = {}) {
  const fixtures = Object.fromEntries(Object.entries(exportTables).map(([table, columns]) => [table,
    ["user_a", "user_b"].flatMap((owner) => Array.from({ length: table === "parties" ? 1001 : 2 }, (_, index) => ({
      ...Object.fromEntries(columns.map((column) => [column, column === "id" ? index + 1 : null])),
      user_id: owner,
      password: "must-not-export", api_key: "must-not-export",
    }))),
  ]));
  fixtures._user_reassign_backup_20260926 = [{ tbl: "orders", key: "1", old_user_id: "previous-owner" }];
  return {
    async begin(options, callback) {
      assert.equal(options, "isolation level repeatable read read only");
      const tx = (strings, ...values) => {
        if (!Array.isArray(strings) || !strings.raw) return { identifier: strings };
        const query = strings.join("?");
        if (query.includes("from pg_roles")) return Promise.resolve([{ rolbypassrls: bypassRls, rolsuper: false }]);
        if (query.includes("from pg_class")) {
          const wanted = values[0].identifier;
          return Promise.resolve(wanted.filter((name) => (omitTables ?? []).includes(name) === false && fixtures[name]).map((name) => ({
            name, rls: true, columns: name === "_user_reassign_backup_20260926" ? ["tbl", "key", "old_user_id"] : [...exportTables[name]].filter((c) => !(dropColumns ?? []).includes(c)),
          })));
        }
        if (query.includes("from public.")) {
          const [columns, table] = values;
          const rows = fixtures[table.identifier].map((row) => Object.fromEntries(columns.identifier.map((column) => [column, row[column]])));
          return { async *cursor(size) {
            assert.equal(size, 500);
            for (let offset = 0; offset < rows.length; offset += size) yield rows.slice(offset, offset + size);
          } };
        }
        return Promise.resolve([]);
      };
      return callback(tx);
    },
  };
}

test("authorized admin exports both owners, all batches and unchanged ownership history", async () => {
  for (const format of ["json", "csv"]) {
    const response = await createDataExportHandler({
      sql: fixtureDatabase(),
      authenticate: async () => identity("user_admin"),
      authorizeFullExport: (id) => id === "user_admin",
    })(request(`?format=${format}&user_id=other&scope=user`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), new RegExp(`^attachment; filename="all-application-data-\\d{4}-\\d{2}-\\d{2}\\.${format}"$`));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, Number(response.headers.get("content-length")));
    const text = new TextDecoder().decode(bytes);
    assert.doesNotMatch(text, /must-not-export|password|api_key/);
    if (format === "json") {
      const body = JSON.parse(text);
      assert.equal(body.export_scope, "all_application_data");
      assert.equal(Object.keys(body.data).length, 13);
      assert.equal(body.data.parties.length, 2002);
      for (const table of Object.keys(exportTables)) {
        assert.deepEqual(new Set(body.data[table].map((row) => row.user_id)), new Set(["user_a", "user_b"]));
      }
      assert.deepEqual(body.data._user_reassign_backup_20260926, [{ tbl: "orders", key: "1", old_user_id: "previous-owner" }]);
      // The manifest lists every table in data order with its row count, so a
      // restore can check the file on its own and load parents before children.
      assert.deepEqual(Object.keys(body.tables), Object.keys(body.data));
      for (const [table, rows] of Object.entries(body.data)) assert.equal(body.tables[table].rows, rows.length, table);
      assert.deepEqual(body.tables.parties.columns, exportTables.parties);
      assert.equal(body.tables.company_ledger_days.key, "ledger_date");
    } else {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      assert.deepEqual(parsed.errors, []);
      assert.equal(parsed.data[0].table, "user");
      assert.equal(parsed.data[0].id, "user_admin");
      for (const table of Object.keys(exportTables)) {
        assert.equal(parsed.data.filter((row) => row.table === table).length, table === "parties" ? 2002 : 4);
      }
      assert.equal(parsed.data.filter((row) => row.table === "_user_reassign_backup_20260926").length, 1);
    }
  }
});

test("full exports adapt to databases without some tables or columns", async () => {
  const response = await adminExport({
    sql: fixtureDatabase({ omitTables: ["company_payments", "_user_reassign_backup_20260926"], dropColumns: ["user_id"] }),
    authenticate: async () => identity("any-user"),
  })(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.unavailable_tables.sort(), ["_user_reassign_backup_20260926", "company_payments"]);
  assert.equal(body.data.company_payments, undefined);
  assert.equal(body.data.parties.length, 2002);
  assert.ok(body.data.parties.every((row) => !("user_id" in row)));
  assert.deepEqual(body.tables.parties.columns, exportTables.parties.filter((c) => c !== "user_id"));
});

test("a role that row-level security would limit fails closed, with no partial JSON", async () => {
  const before = await tempExports();
  const response = await adminExport({ sql: fixtureDatabase({ bypassRls: false }), authenticate: async () => identity("user_admin") })(request());
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.ok(body.error);
  assert.equal(body.data, undefined);
  assert.deepEqual(await tempExports(), before);
});

test("CSV escapes commas, quotes, newlines, Unicode, and spreadsheet formulas", () => {
  const strings = ['Text, with "quotes"\nand اردو', "=HYPERLINK(\"https://example.com\")", "+cmd", "-cmd", "@SUM(A1)", "  =SUM(A1)", "\t=SUM(A1)", "\r=1", "\n=1"];
  const parsed = Papa.parse(strings.map(csvCell).join(",") + "\r\n", { skipEmptyLines: true });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data[0][0], strings[0]);
  assert.deepEqual(parsed.data[0].slice(1), strings.slice(1).map((value) => "'" + value));
  assert.equal(csvCell(-12), '"-12"');
  assert.equal(csvCell(null), '""');
});

test("live read-only full export: completeness, relationships, cleanup", {
  skip: process.env.RUN_LIVE_EXPORT_TESTS !== "1",
}, async () => {
  const sql = postgres(process.env.SUPABASE_CONNECTION_STRING, { ssl: "require", prepare: false, max: 1 });
  try {
    // Only inspect existing data. Never seed or mutate a production database.
    const before = await tempExports();
    const expected = await sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`set local search_path = public`;
      const counts = {};
      for (const table of [...Object.keys(exportTables), "_user_reassign_backup_20260926"]) {
        const [row] = await tx`select count(*)::int as count from public.${tx(table)}`;
        counts[table] = row.count;
      }
      return counts;
    });
    const handler = adminExport({ sql, authenticate: async () => identity("test-admin") });
    for (const format of ["json", "csv"]) {
      const response = await handler(request(`?format=${format}`));
      assert.equal(response.status, 200);
      if (format === "json") {
        const body = await response.json();
        assert.equal(body.export_scope, "all_application_data");
        for (const [table, count] of Object.entries(expected)) assert.equal(body.data[table].length, count, table);
        const relations = [
          ["orders", "party_id", "parties"],
          ["order_items", "order_id", "orders"], ["order_items", "product_id", "products"],
          ["payments", "party_id", "parties"], ["payments", "order_id", "orders"],
          ["product_returns", "order_id", "orders"], ["product_returns", "payment_id", "payments"],
          ["product_return_items", "return_id", "product_returns"],
          ["product_return_items", "order_item_id", "order_items"], ["product_return_items", "product_id", "products"],
          ["company_purchases", "company_id", "companies"], ["company_ledger_order_paid", "order_id", "orders"],
        ];
        for (const [child, fk, parent] of relations) {
          const ids = new Set(body.data[parent].map((row) => row.id));
          for (const row of body.data[child]) {
            if (row[fk] !== null) assert.ok(ids.has(row[fk]), `${child}.${fk}: parent must be in the same export`);
          }
        }
      } else {
        const parsed = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
        assert.deepEqual(parsed.errors, []);
        for (const [table, count] of Object.entries(expected)) assert.equal(parsed.data.filter((row) => row.table === table).length, count, table);
      }
    }
    // Cancelled downloads must also remove their temporary files.
    const cancelled = await handler(request());
    assert.equal(cancelled.status, 200);
    await cancelled.body.cancel();
    assert.deepEqual(await tempExports(), before);
  } finally {
    await sql.end();
  }
});
