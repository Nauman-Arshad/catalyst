import "server-only";
import postgres, { type ParameterOrFragment, type TransactionSql } from "postgres";
import { auth } from "@clerk/nextjs/server";

const connectionString = process.env.SUPABASE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error(
    "SUPABASE_CONNECTION_STRING is not set. Add your Supabase Postgres connection string to .env",
  );
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

const base =
  globalForDb.sql ??
  postgres(connectionString, {
    ssl: "require",
    // Disable prepared statements so the client works behind Supabase's
    // transaction pooler (port 6543), which serverless platforms like Vercel
    // require. Also works with the session pooler.
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    // Parse Postgres bigint (int8, OID 20) and numeric (OID 1700) as JS numbers
    // so rows line up with the `number` fields in our TypeScript types. IDs and
    // money in this app are well within Number's safe range.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number) => x.toString(),
        parse: (x: string) => parseInt(x, 10),
      },
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => x.toString(),
        parse: (x: string) => parseFloat(x),
      },
      // Keep date/timestamp columns as raw strings (our types use `string`).
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
      timestamp: {
        to: 1114,
        from: [1114, 1184],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = base;
}

// Each query runs in its own transaction as `catalyst_app` with
// `app.current_user_id` set, so row-level security limits it to the signed-in
// user's rows. search_path and row_security are pinned too, because the
// transaction pooler can hand over a connection another client changed.
async function asCurrentUser<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return (await base.begin(async (tx) => {
    await tx`select set_config('role', 'catalyst_app', true),
                    set_config('app.current_user_id', ${userId}, true),
                    set_config('search_path', 'public', true),
                    set_config('row_security', 'on', true)`;
    return fn(tx);
  })) as T;
}

function userQuery(strings: TemplateStringsArray, ...values: ParameterOrFragment<never>[]) {
  if (!Array.isArray(strings) || !("raw" in strings)) {
    throw new Error("sql(...) helpers are only available as tx(...) inside sql.begin");
  }
  if (values.some((value) => typeof (value as { then?: unknown } | null)?.then === "function")) {
    throw new Error("Nested sql`…` fragments must be built with tx inside sql.begin");
  }
  return asCurrentUser(async (tx) => await tx(strings, ...values));
}

/** The signed-in user's view of the database: sql`…` or sql.begin(async (tx) => …). */
export const sql = Object.assign(userQuery, { begin: asCurrentUser });

/** Bypasses per-user isolation. Only for the export handlers, which set their own role. */
export const unscopedSql = base;
