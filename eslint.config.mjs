import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Init localStorage, timer et sauvegarde de fin de round appellent
      // volontairement setState dans un effet : on garde l'avertissement mais
      // sans bloquer le build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
