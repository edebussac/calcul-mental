import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Type de connexion partagé — les services l'acceptent en paramètre (testable). */
export type Database = NodePgDatabase<typeof schema>;

declare global {
  // Réutilise le pool entre les rechargements à chaud en dev.
  var __dbPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // On n'échoue pas à l'import (build, pages sans requête) : l'erreur
    // remontera clairement à la première requête si la config manque.
    console.warn("DATABASE_URL n'est pas définie — les requêtes échoueront.");
  }
  return new Pool({ connectionString });
}

const pool = global.__dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__dbPool = pool;
}

export const db: Database = drizzle(pool, { schema });
