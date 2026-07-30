# Calcul mental — app native

App mobile **iOS puis Android** (Expo SDK 57 / React Native 0.86). C'est la
**cible** du projet : la version Next.js à la racine du dépôt n'est qu'un banc
d'essai, appelé à disparaître.

## Démarrer

```bash
npm install
npm start
```

Puis ouvrir `exp://127.0.0.1:8081` dans Expo Go sur le simulateur.

> Sur un simulateur piloté sans l'app Simulator au premier plan, `npx expo start
> --ios` échoue sur `osascript` : lancer `npm start` seul et ouvrir l'URL à la
> main.

## Vérifier

```bash
npm test
```

Les tests de `src/lib/game/` tournent sous **Node**, sans simulateur ni
émulateur — c'est voulu, et c'est ce qui les garde rapides (~200 ms).

```bash
npm run typecheck
```

## Organisation

| Chemin | Rôle |
| --- | --- |
| `src/lib/game/` | Le cerveau du jeu. TypeScript pur, aucune API de plateforme. Partagé avec le banc d'essai web. |
| `src/lib/export/` | Export CSV. Pur également. |
| `src/lib/db/` | Schéma SQLite, ouverture de la base, migrations inlinées. |
| `src/lib/services/` | Lecture/écriture métier. Reprises du banc d'essai. |
| `src/app/` | Les écrans (expo-router, routage par fichiers). |
| `tests/unit/` | Tests du cerveau, repris tels quels du banc d'essai. |
| `tests/integration/` | Services adossés à un SQLite en mémoire. |

## Base de données

Locale, sur l'appareil (`expo-sqlite`) : **aucun réseau**, l'app marche en avion.
Après toute modification de `src/lib/db/schema.ts` :

```bash
npm run db:generate
```

Jamais `drizzle-kit generate` seul — voir [`AGENTS.md`](AGENTS.md).

`@/*` résout vers `./src/*`, donc `@/lib/game/...` s'écrit exactement comme à la
racine du dépôt.

## État

Étapes 1 à 3 du plan de migration faites : squelette, persistance locale, et les
écrans d'accueil et de jeu (avec son pavé numérique).

Restent à construire :

- l'écran **des scores** (`src/app/scores.tsx` est un substitut) — les services
  qui l'alimentent (`bestScores`, `multiplicationFactStats`) sont déjà portés et
  testés ;
- le **niveau** (Facile → Légendaire) et le **mode vocal**, présentés « à venir »
  dans la feuille de configuration parce qu'ils n'existent pas dans le code.

Règles de contribution : [`AGENTS.md`](AGENTS.md).
Contexte, décisions et pièges : [`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md).
