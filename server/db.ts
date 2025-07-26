// import { Pool, neonConfig } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/neon-serverless';
// import ws from "ws";
import * as schema from "@shared/schema";
//
// neonConfig.webSocketConstructor = ws;
//
// if (!process.env.DATABASE_URL) {
//   throw new Error(
//     "DATABASE_URL must be set. Did you forget to provision a database?",
//   );
// }
//
// export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// export const db = drizzle({ client: pool, schema });


import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
// import { schema } from './drizzle/schema';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // should be like postgres://user:pass@localhost:5432/db
});
export const db = drizzle(pool, { schema });

