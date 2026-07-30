/**
 * Convertit les migrations générées par drizzle-kit en module TypeScript.
 *
 * Pourquoi ne pas utiliser le `drizzle/migrations.js` que drizzle-kit produit
 * avec `driver: "expo"` : il fait `import m0000 from './0000_….sql'`, et Metro
 * n'a aucun moyen natif de charger un `.sql`. Le déclarer dans
 * `resolver.sourceExts` ne suffit pas — Metro le résout alors, mais tente de le
 * *parser comme du JavaScript* et échoue sur « Missing semicolon » dès
 * `CREATE TABLE`.
 *
 * Inliner le SQL dans un `.ts` supprime le problème à la racine : plus de
 * configuration Metro, plus de transformeur à maintenir. La source de vérité
 * reste `src/lib/db/schema.ts` → drizzle-kit → `.sql` → ce module, donc aucune
 * dérive possible tant qu'on passe par `npm run db:generate`.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "drizzle");
const outFile = join(root, "src", "lib", "db", "migrations.ts");

const journal = JSON.parse(
  readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"),
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// `useMigrations` attend une clé par entrée du journal, nommée m0000, m0001…
const entries = files.map((file, i) => {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const key = `m${String(i).padStart(4, "0")}`;
  // JSON.stringify échappe backticks, sauts de ligne et guillemets d'un coup —
  // le SQL de SQLite est truffé de backticks autour des identifiants.
  return `  ${key}: ${JSON.stringify(sql)},`;
});

const contents = `// Généré par scripts/build-migrations.mjs — NE PAS ÉDITER À LA MAIN.
// Régénérer avec : npm run db:generate

export default {
  journal: ${JSON.stringify(journal, null, 2).replace(/\n/g, "\n  ")},
  migrations: {
${entries.join("\n")}
  },
};
`;

writeFileSync(outFile, contents);
console.log(
  `${files.length} migration(s) inlinée(s) → src/lib/db/migrations.ts`,
);
