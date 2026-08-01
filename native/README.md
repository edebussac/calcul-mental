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

Étapes 1 à 4 du plan de migration faites : squelette, persistance locale,
écrans (accueil, jeu, scores) avec pavé numérique, et **installée sur un vrai
iPhone** (build de dev). Identité visuelle (icône, splash) posée en avance sur
l'étape 5.

Au-delà du plan initial : **niveaux** (`Facile` 1–10 à `Légendaire` 2–100, voir
`src/lib/game/levels.ts`), décompte de 3 s avant chaque partie, filtres sur
l'écran des scores, et **l'énoncé vocal** — bloc ③ de la feuille
d'entraînement, réglage global gardé d'une partie à l'autre, écrit par défaut.

Vocal et écrit **s'excluent** : en vocal la question n'est pas affichée (sinon
la voix ne serait qu'un doublon, et l'écrit gagnerait toujours), et un bouton
prend sa place pour la redire autant de fois que voulu.

Le **record personnel** est annoncé au moment où il tombe (bannière et retour
haptique), puis rappelé sur l'écran de résultat. Il se compte **à conditions
identiques** — même opération, même niveau, même mode, même énoncé : cf.
[`AGENTS.md`](AGENTS.md).

Plus rien n'est présenté comme « à venir » dans l'app : la **réponse dictée**,
seule option restée à l'état de maquette, a été retirée — elle ne sera pas
proposée.

Vérifié sur un vrai iPhone : la saisie à 5 chiffres (Légendaire), l'haptique
(ajustée deux fois sur retour direct — voir `src/lib/haptics.ts`). **Pas
encore vérifié** : le chevauchement réel de deux doigts sur le pavé (§7/§9 du
doc de migration) — le seul point du plan qu'aucun test, aucun simulateur, ne
peut prouver.

Pas commencé : publication (compte développeur Apple à 99 €/an, TestFlight,
App Store — étape 5) et Android (étape 6, compte Google Play 25 $).

Règles de contribution : [`AGENTS.md`](AGENTS.md).
Contexte, décisions et pièges : [`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md).
