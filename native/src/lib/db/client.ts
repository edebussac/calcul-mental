import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import * as schema from "./schema";

/**
 * Base **locale**, sur l'appareil. L'app fonctionne en avion : aucune requête
 * réseau n'entre dans ce chemin (cf. MIGRATION-MOBILE.md §11 — le téléphone
 * poussera un jour vers un serveur, mais ne lira jamais son historique depuis
 * lui).
 */
const DB_NAME = "calcul-mental.db";

/**
 * Type de connexion partagé — les services l'acceptent en paramètre, ce qui les
 * rend testables sous Node sans simulateur : les tests injectent un Drizzle
 * adossé à better-sqlite3. L'API du query-builder est la même, seul le driver
 * change (même idiome que `tests/integration/helpers/testDb.ts` du banc d'essai).
 */
export type Database = ExpoSQLiteDatabase<typeof schema>;

let cached: Database | undefined;

/**
 * Ouvre la base (une seule fois par lancement).
 *
 * `enableChangeListener` est laissé à `false` : rien n'observe la base en
 * dehors des écrans qui la lisent explicitement, et l'activer coûterait des
 * notifications à chaque écriture — or on écrit une ligne par réponse.
 */
export function getDb(): Database {
  if (!cached) {
    const native = SQLite.openDatabaseSync(DB_NAME);
    cached = drizzle(native, { schema });
  }
  return cached;
}
