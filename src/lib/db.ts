import "server-only";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error(
    "SUPABASE_CONNECTION_STRING is not set. Add your Supabase Postgres connection string to .env",
  );
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export const sql =
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
  globalForDb.sql = sql;
}
