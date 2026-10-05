// Restores a complete application backup (the JSON from "Download Complete
// Backup") into an EMPTY database, keeping every id, owner and timestamp.
// Run with:  RESTORE_DATABASE_URL=postgres://… node db/restore-backup.mjs <backup.json>
//
// The target is never taken from SUPABASE_CONNECTION_STRING, so a restore can't
// land on the live database by accident. If the target has no Catalyst tables,
// db/backup-schema.sql is applied first. It refuses to run if any table that
// the backup covers already holds rows, and everything happens in one
// transaction: either the whole backup is restored or nothing changes.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
const target = process.env.RESTORE_DATABASE_URL;
if (!file || !target) {
  console.error("Usage: RESTORE_DATABASE_URL=postgres://… node db/restore-backup.mjs <backup.json>");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(file, "utf8"));
if (backup.export_scope !== "all_application_data" || !backup.data) {
  console.error("Not a complete application backup (export_scope must be all_application_data).");
  process.exit(1);
}
// Files from before the manifest existed restore in their own table order.
const manifest = backup.tables ?? Object.fromEntries(Object.entries(backup.data).map(([table, rows]) => [table, { rows: rows.length }]));
for (const [table, { rows }] of Object.entries(manifest)) {
  if (backup.data[table]?.length !== rows) {
    console.error(`${table}: the file has ${backup.data[table]?.length ?? 0} rows but its manifest says ${rows}. The file is incomplete.`);
    process.exit(1);
  }
}

const sql = postgres(target, { ssl: "prefer", prepare: false, max: 1, onnotice: () => {} });

async function main() {
  await sql.begin(async (tx) => {
    const existing = new Set((await tx`
      select table_name from information_schema.tables where table_schema = 'public'
    `).map((r) => r.table_name));
    if (!existing.has("parties")) {
      console.log("Empty database: applying db/backup-schema.sql…");
      await tx.unsafe(readFileSync(new URL("./backup-schema.sql", import.meta.url), "utf8"));
      await tx`select set_config('search_path', 'public', true)`;
      for (const r of await tx`select table_name from information_schema.tables where table_schema = 'public'`) existing.add(r.table_name);
    }

    const tables = Object.keys(manifest).filter((table) => {
      if (existing.has(table)) return true;
      console.log(`Skipping ${table}: the target database has no such table.`);
      return false;
    });
    for (const table of tables) {
      const [{ count }] = await tx`select count(*)::int as count from public.${tx(table)}`;
      if (count > 0) throw new Error(`${table} already has ${count} rows. Restore only into an empty database.`);
    }

    for (const table of tables) {
      const rows = backup.data[table];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const list = columns.map((c) => `"${c.replaceAll('"', '""')}"`).join(", ");
      const identity = (await tx`
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and is_identity = 'YES'
      `).length > 0;
      // jsonb_populate_recordset converts each JSON value to its column type.
      await tx.unsafe(
        `insert into public."${table}" (${list}) ${identity ? "overriding system value" : ""}
         select ${list} from jsonb_populate_recordset(null::public."${table}", $1::text::jsonb)`,
        [JSON.stringify(rows)],
      );
      console.log(`Restored ${table}: ${rows.length}`);
    }

    // Move each id sequence past the restored ids so new records don't collide.
    for (const { table_name, column_name } of await tx`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and is_identity = 'YES'
    `) {
      await tx`select setval(
        pg_get_serial_sequence(${"public." + table_name}, ${column_name}),
        coalesce((select max(${tx(column_name)}) from public.${tx(table_name)}), 0) + 1, false)`;
    }

    for (const table of tables) {
      const [{ count }] = await tx`select count(*)::int as count from public.${tx(table)}`;
      if (count !== backup.data[table].length) throw new Error(`${table}: expected ${backup.data[table].length} rows, found ${count}.`);
    }
  });
  console.log(`Done. Backup from ${backup.exported_at} restored and row counts verified.`);
}

main()
  .catch((err) => {
    console.error("Restore failed; nothing was changed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
