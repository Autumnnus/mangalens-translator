import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres"; // or 'pg' if we preferred that, but postgres-js is usually better for serverless/edge compatibility if needed, though 'pg' is standard. Plan said 'postgres' package.
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Disable prefetch as it is not supported for "Transaction" pool mode if used
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
