import { defineConfig } from "drizzle-kit";

/**
 * Pas de `driver: "expo"` — délibérément.
 *
 * Ce driver ajoute un `drizzle/migrations.js` qui fait
 * `import m0000 from './0000_….sql'`. Metro ne sait pas charger un `.sql`, et le
 * déclarer dans `resolver.sourceExts` n'y change rien : il le résout alors, mais
 * tente de le parser comme du JavaScript et échoue sur « Missing semicolon » dès
 * `CREATE TABLE`. Le générer ne ferait donc que laisser traîner un fichier
 * inutilisable.
 *
 * À la place, `scripts/build-migrations.mjs` inline le SQL dans
 * `src/lib/db/migrations.ts`. Toujours passer par `npm run db:generate`, qui
 * enchaîne les deux.
 *
 * Pas de `dbCredentials` non plus : la base est locale à l'appareil, il n'y a
 * aucune URL de connexion à fournir.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
