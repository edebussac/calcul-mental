import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/**
 * Vrai SQLite en mémoire, initialisé avec les **mêmes migrations** que l'app →
 * les tests valident le schéma réellement embarqué, pas une copie qui pourrait
 * dériver.
 *
 * Le driver diffère de la production (better-sqlite3 sous Node, expo-sqlite sur
 * l'appareil) mais l'API du query-builder Drizzle est la même, d'où le cast —
 * exactement l'idiome du banc d'essai web, qui teste du Postgres node-postgres
 * avec PGlite. C'est ce qui permet de tester la persistance **sans simulateur**.
 */
export function createTestDb(): Database {
  const client = new BetterSqlite3(":memory:");
  // SQLite n'applique pas les clés étrangères par défaut : sans ça, une session
  // rattachée à un profil inexistant passerait sans bruit.
  client.pragma("foreign_keys = ON");

  const migrationsDir = join(process.cwd(), "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sqlText = readFileSync(join(migrationsDir, file), "utf8").replace(
      /-->\s*statement-breakpoint/g,
      "",
    );
    client.exec(sqlText);
  }

  return drizzle(client, { schema }) as unknown as Database;
}
