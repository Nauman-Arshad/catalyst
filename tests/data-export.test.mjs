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
const request = (suffix = "", options) => new Request(`http://localhost/api/my-data${suffix}`, options);
const tempExports = async () => (await readdir(tmpdir())).filter((name) => name.startsWith("catalyst-export-")).sort();

test("unauthenticated requests are rejected before accessing the database", async () => {
  const response = await createDataExportHandler({ sql: noDatabase, authenticate: async () => null })(request("?user_id=user_b"));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("cross-site exports are rejected", async () => {
  const response = await createDataExportHandler({ sql: noDatabase, authenticate: async () => identity("user_a") })(request("", { headers: { "sec-fetch-site": "cross-site" } }));
  assert.equal(response.status, 403);
});

test("authentication and database failures are sanitized and temporary files removed", async () => {
  const before = await tempExports();
  for (const authenticate of [async () => { throw new Error("CLERK_SECRET_KEY=secret"); }, async () => identity("user_a")]) {
    const response = await createDataExportHandler({ sql: noDatabase, authenticate })(request());
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /CLERK_SECRET_KEY|Database must/);
  }
  assert.deepEqual(await tempExports(), before);
});

test("export manifest excludes backup tables and secret columns", () => {
  assert.equal(Object.keys(exportTables).length, 12);
  for (const [table, columns] of Object.entries(exportTables)) {
    assert.doesNotMatch(table, /backup|auth|secret/);
    assert.ok(columns.includes("user_id"));
    assert.ok(!columns.some((column) => /password|token|api_key|secret|metadata/i.test(column)));
  }
});

function fixtureDatabase({ leak = false, unsafeRole = false } = {}) {
  const fixtures = Object.fromEntries(Object.entries(exportTables).map(([table, columns]) => [table,
    ["user_a", "user_b"].flatMap((owner) => Array.from({ length: table === "parties" ? 1001 : 2 }, (_, index) => ({
      ...Object.fromEntries(columns.map((column) => [column, column === "id" ? index + 1 : null])),
      user_id: owner,
      password: "must-not-export", api_key: "must-not-export",
    }))),
  ]));
  let batches = 0;
  const sql = {
    async begin(options, callback) {
      assert.equal(options, "isolation level repeatable read read only");
      let roleSet = false;
      let currentId;
      const tx = (strings, ...values) => {
        if (!Array.isArray(strings) || !strings.raw) return { identifier: strings };
        const query = strings.join("?");
        if (query.includes("set local role catalyst_app")) roleSet = true;
        if (query.includes("set_config")) currentId = values[0];
        if (query.includes("from pg_roles")) return Promise.resolve([{ rolbypassrls: unsafeRole, rolsuper: false }]);
        if (query.includes("from public.")) {
          assert.ok(roleSet && currentId);
          const [columns, table, requestedId] = values;
          assert.equal(requestedId, currentId);
          const rows = fixtures[table.identifier]
            .filter((row) => leak || row.user_id === currentId)
            .map((row) => Object.fromEntries(columns.identifier.map((column) => [column, row[column]])));
          return { async cursor(size, consume) {
            assert.equal(size, 500);
            for (let offset = 0; offset < rows.length; offset += size) {
              batches++;
              await consume(rows.slice(offset, offset + size));
            }
          } };
        }
        return Promise.resolve([]);
      };
      return callback(tx);
    },
  };
  return { sql, get batches() { return batches; } };
}

test("two populated fixture users export only their own records across multiple batches", async () => {
  const database = fixtureDatabase();
  for (const id of ["user_a", "user_b"]) {
    const other = id === "user_a" ? "user_b" : "user_a";
    const response = await createDataExportHandler({ sql: database.sql, authenticate: async () => identity(id) })(
      request(`?user_id=${other}`, { method: "POST", body: JSON.stringify({ user_id: other }) }),
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.doesNotMatch(body, /must-not-export|password|api_key/);
    const result = JSON.parse(body);
    for (const [table, rows] of Object.entries(result.data)) {
      assert.equal(rows.length, table === "parties" ? 1001 : 2);
      assert.ok(rows.every((row) => row.user_id === id));
    }
  }
  assert.equal(database.batches, 28);
});

test("unsafe roles and unexpected foreign-owned rows fail closed, with no partial JSON", async () => {
  const before = await tempExports();
  for (const options of [{ unsafeRole: true }, { leak: true }]) {
    const response = await createDataExportHandler({ sql: fixtureDatabase(options).sql, authenticate: async () => identity("user_a") })(request());
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.ok(body.error);
    assert.equal(body.data, undefined);
  }
  assert.deepEqual(await tempExports(), before);
});

test("CSV includes every table, profile, and batch while ignoring another user's ID", async () => {
  for (const id of ["user_a", "user_b"]) {
    const response = await createDataExportHandler({ sql: fixtureDatabase().sql, authenticate: async () => identity(id) })(request("?format=csv&user_id=another_user"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.match(response.headers.get("content-disposition"), /my-data-\d{4}-\d{2}-\d{2}\.csv/);
    const body = await response.text();
    const parsed = Papa.parse(body, { header: true, skipEmptyLines: true });
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.data.length, 1024);
    assert.equal(parsed.data[0].table, "user");
    assert.equal(parsed.data[0].id, id);
    assert.ok(parsed.data.every((row) => row.user_id === id));
    for (const table of Object.keys(exportTables)) {
      assert.equal(parsed.data.filter((row) => row.table === table).length, table === "parties" ? 1001 : 2);
    }
    assert.doesNotMatch(body, /must-not-export|password|api_key/);
  }
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

test("live read-only exports: A/B isolation, ID manipulation, completeness, relationships, cleanup", {
  skip: process.env.RUN_LIVE_EXPORT_TESTS !== "1",
}, async () => {
  const sql = postgres(process.env.SUPABASE_CONNECTION_STRING, { ssl: "require", prepare: false, max: 1 });
  try {
    // Only inspect existing data. Never seed or mutate a production database.
    const ownerIds = new Set();
    await sql.begin("read only", async (tx) => {
      for (const table of Object.keys(exportTables)) {
        const rows = await tx`select distinct user_id from public.${tx(table)} where user_id is not null limit 2`;
        for (const row of rows) ownerIds.add(row.user_id);
      }
    });
    assert.ok(ownerIds.size > 0, "An existing owner is required for the live test");
    // A database with only one populated owner still verifies that another
    // session receives none of that owner's data, without creating test data.
    if (ownerIds.size === 1) ownerIds.add("user_export_test_nonexistent");
    const owners = [...ownerIds].slice(0, 2).map((user_id) => ({ user_id }));
    const before = await tempExports();
    const exports = [];
    for (const { user_id: id } of owners) {
      const handler = createDataExportHandler({ sql, authenticate: async () => identity(id) });
      const other = owners.find((owner) => owner.user_id !== id).user_id;
      const response = await handler(request(`?user_id=${encodeURIComponent(other)}&id=${encodeURIComponent(other)}`));
      assert.equal(response.status, 200, "The restricted RLS role must be usable");
      assert.match(response.headers.get("content-disposition"), /^attachment; filename="my-data-\d{4}-\d{2}-\d{2}\.json"$/);
      const body = await response.text();
      assert.equal(Buffer.byteLength(body), Number(response.headers.get("content-length")));
      const result = JSON.parse(body);
      assert.equal(result.user.id, id);
      assert.deepEqual(Object.keys(result.user).sort(), ["email", "id", "name"]);
      assert.equal(result.export_version, "1.0");
      assert.ok(Number.isFinite(Date.parse(result.exported_at)));
      assert.deepEqual(Object.keys(result.data).sort(), Object.keys(exportTables).sort());
      for (const [table, columns] of Object.entries(exportTables)) {
        const expected = await sql.begin("read only", (tx) => tx`
          select count(*)::int as count from public.${tx(table)} where user_id = ${id}
        `);
        assert.equal(result.data[table].length, expected[0].count, `${table}: every owned record must be exported`);
        for (const row of result.data[table]) {
          assert.equal(row.user_id, id);
          assert.deepEqual(Object.keys(row).sort(), [...columns].sort());
        }
      }
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
        const ids = new Set(result.data[parent].map((row) => row.id));
        for (const row of result.data[child]) {
          if (row[fk] !== null) assert.ok(ids.has(row[fk]), `${child}.${fk}: parent must be in the same export`);
        }
      }
      exports.push(result);
      const csvResponse = await handler(request(`?format=csv&user_id=${encodeURIComponent(other)}`));
      assert.equal(csvResponse.status, 200);
      const csv = Papa.parse(await csvResponse.text(), { header: true, skipEmptyLines: true });
      assert.deepEqual(csv.errors, []);
      assert.ok(csv.data.every((row) => row.user_id === id));
      for (const table of Object.keys(exportTables)) {
        assert.equal(csv.data.filter((row) => row.table === table).length, result.data[table].length);
      }
    }
    assert.notEqual(exports[0].user.id, exports[1].user.id);
    // Read-only RLS query independently checks that even an explicit other-user
    // predicate cannot access their rows under A's session context.
    await sql.begin("read only", async (tx) => {
      await tx`set local role catalyst_app`;
      await tx`select set_config('app.current_user_id', ${owners[0].user_id}, true)`;
      for (const table of Object.keys(exportTables)) {
        const rows = await tx`select count(*)::int as count from public.${tx(table)} where user_id = ${owners[1].user_id}`;
        assert.equal(rows[0].count, 0);
      }
    });
    // Cancelled downloads must also remove their temporary files.
    const cancelled = await createDataExportHandler({ sql, authenticate: async () => identity(owners[0].user_id) })(request());
    assert.equal(cancelled.status, 200);
    await cancelled.body.cancel();
    const empty = await createDataExportHandler({ sql, authenticate: async () => identity("user_export_test_nonexistent") })(request());
    assert.equal(empty.status, 200);
    assert.ok(Object.values((await empty.json()).data).every((rows) => rows.length === 0));
    assert.deepEqual(await tempExports(), before);
    const [context] = await sql`select current_user, current_setting('app.current_user_id', true) as user_id`;
    assert.notEqual(context.current_user, "catalyst_app");
    assert.ok(!context.user_id, "Transaction-local identity must not leak into a reused connection");
  } finally {
    await sql.end();
  }
});
