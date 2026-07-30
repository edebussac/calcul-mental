import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    // Même alias que `tsconfig.json` (`@/*` → `./src/*`). C'est lui qui permet
    // de reprendre les tests du banc d'essai web sans toucher une ligne :
    // là-bas `@` pointait sur la racine, ici sur `src`, et `@/lib/game/...`
    // résout dans les deux cas.
    alias: { "@": srcDir.replace(/\/$/, "") },
  },
  test: {
    name: "node",
    environment: "node",
    // Les tests d'intégration tournent aussi sous Node : ils adossent les mêmes
    // services à un SQLite en mémoire (better-sqlite3), sans simulateur.
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
