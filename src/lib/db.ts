import "server-only";
import postgres, { type ParameterOrFragment, type Row, type RowList, type TransactionSql } from "postgres";
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
//
// Round trips to the database are what cost time, so statements are pipelined
// on one reserved connection instead of awaited one by one. `begin` and the
// setup go out as one parameterless simple-protocol message, because postgres.js
// stops to have the server describe any parameterised statement before running
// it. If any statement fails the transaction is aborted, every later statement
// fails too, and the pipelined commit only rolls back.
type Reserved = Awaited<ReturnType<typeof base.reserve>>;

async function currentUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  // The id is written into the setup below, so accept nothing but Clerk's
  // `user_` + alphanumerics shape: no quote or backslash can get through.
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) throw new Error("Unexpected user id");
  return userId;
}

function beginAs(conn: Reserved, userId: string) {
  return conn.unsafe(`begin;
    select set_config('role', 'catalyst_app', true),
           set_config('app.current_user_id', '${userId}', true),
           set_config('search_path', 'public', true),
           set_config('row_security', 'on', true)`);
}

// Starts every statement in order (so they go out together) and waits for all
// of them, so a failure never leaves a rejection unhandled.
async function pipeline<T extends readonly PromiseLike<unknown>[]>(queries: T) {
  const settled = await Promise.allSettled(queries);
  const failed = settled.find((s) => s.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return settled.map((s) => (s as PromiseFulfilledResult<unknown>).value);
}

// COMMIT on a transaction that already failed reports ROLLBACK instead of
// raising, so a failed statement nobody awaited must not pass for success.
function assertCommitted(result: unknown) {
  if ((result as { command?: string }).command !== "COMMIT") {
    throw new Error("Transaction was rolled back");
  }
}

async function asCurrentUser<T>(fn: (tx: TransactionSql) => Promise<T> | T): Promise<T> {
  const userId = await currentUserId();
  const conn = await base.reserve();
  try {
    await beginAs(conn, userId);
    let result: T;
    try {
      const x = fn(conn as unknown as TransactionSql);
      result = (await (Array.isArray(x) ? Promise.all(x) : x)) as T;
    } catch (error) {
      await conn`rollback`.catch(() => {});
      throw error;
    }
    assertCommitted(await conn`commit`);
    return result;
  } finally {
    conn.release();
  }
}

async function runAsCurrentUser(strings: TemplateStringsArray, values: ParameterOrFragment<never>[]) {
  const userId = await currentUserId();
  const conn = await base.reserve();
  try {
    const [, rows, commit] = await pipeline([
      beginAs(conn, userId),
      conn(strings, ...values),
      conn`commit`,
    ]);
    assertCommitted(commit);
    return rows as RowList<Row[]>;
  } finally {
    conn.release();
  }
}

function userQuery(strings: TemplateStringsArray, ...values: ParameterOrFragment<never>[]) {
  if (!Array.isArray(strings) || !("raw" in strings)) {
    throw new Error("sql(...) helpers are only available as tx(...) inside sql.begin");
  }
  if (values.some((value) => typeof (value as { then?: unknown } | null)?.then === "function")) {
    throw new Error("Nested sql`…` fragments must be built with tx inside sql.begin");
  }
  return runAsCurrentUser(strings, values);
}

/** The signed-in user's view of the database: sql`…` or sql.begin(async (tx) => …). */
export const sql = Object.assign(userQuery, { begin: asCurrentUser });

/** Bypasses per-user isolation. Only for the export handlers, which set their own role. */
export const unscopedSql = base;
