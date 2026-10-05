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

// Every user owns their own rows. Each query runs in a transaction as the
// restricted `catalyst_app` role with `app.current_user_id` set to the signed-in
// Clerk user, so the database's row-level security policies show and change
// only that user's rows, and new rows get that user_id from the column default.
async function asCurrentUser<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return (await base.begin(async (tx) => {
    await tx`select set_config('role', 'catalyst_app', true),
                    set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  })) as T;
}

function userQuery(strings: TemplateStringsArray, ...values: ParameterOrFragment<never>[]) {
  return asCurrentUser(async (tx) => await tx(strings, ...values));
}

/**
 * The signed-in user's view of the database. Use it as a tagged template
 * (sql`…`) or as sql.begin(async (tx) => …). Helpers and fragments such as
 * tx(ids) or tx`where …` belong inside sql.begin, built with `tx`.
 */
export const sql = Object.assign(userQuery, { begin: asCurrentUser });

// Bypasses per-user isolation. Only for the data export handlers, which set
// their own role and owner (src/lib/data-export.ts). Never for app queries.
export const unscopedSql = base;
