import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";

/**
 * Vrai Postgres en mémoire (PGlite, WASM) initialisé avec les MÊMES migrations
 * SQL que la production → les tests d'intégration valident le schéma réel.
 *
 * Le type est casté vers `Database` (adaptateur node-postgres en prod) : l'API
 * du query-builder Drizzle est identique, seul le driver change.
 */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite();

  const migrationsDir = join(process.cwd(), "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sqlText = readFileSync(join(migrationsDir, file), "utf8").replace(
      /-->\s*statement-breakpoint/g,
      "",
    );
    await client.exec(sqlText);
  }

  return drizzle(client, { schema }) as unknown as Database;
}
