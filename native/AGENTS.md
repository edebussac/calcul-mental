# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ici, l'UI *est* le produit

Ce dossier est l'app mobile native (Expo / React Native, SDK 57) : **la cible du
projet**. La version Next.js à la racine du dépôt est un banc d'essai jetable.

> ⚠️ **Ne pas transposer ici la règle « ne pas investir dans l'UI » de
> [`../AGENTS.md`](../AGENTS.md).** Elle vise le banc d'essai web, où le style
> était effectivement jeté. Dans `native/`, le soin porté aux écrans, au pavé
> numérique et au ressenti de la saisie constitue le produit lui-même.

## Ce qui reste vrai des deux côtés

- **`src/lib/game/` reste du TypeScript pur** : aucun import hors
  `src/lib/game/`, aucune API de plateforme (`window`, `fetch`, `expo-*`…).
  C'est ce qui garde ses tests exécutables sous Node, sans simulateur.
- **Toute décision de jeu va dans `src/lib/game/`**, avec un test unitaire.
  Jamais une constante de règles de jeu dans un composant : elle fausserait la
  comparaison des scores historiques le jour où on la change.
- `@/*` résout vers `./src/*` (`tsconfig.json` et `vitest.config.ts` sont
  alignés), donc `@/lib/game/...` s'écrit exactement comme à la racine.

## L'exigence durable du pavé numérique

Reprise du §7 de [`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md) :

> Un chiffre s'enregistre **au contact**, pas au relâchement, et deux touches
> doivent être pressables **indépendamment** — le besoin réel est le
> *chevauchement ordonné* : poser le 6 pendant que le 5 est enfoncé ne doit rien
> perdre, et l'ordre est celui des contacts.

Les `Pressable` par défaut sérialisent les touchers.
`react-native-gesture-handler` est déjà installé pour cette raison.

## État provisoire

`src/app/index.tsx` est un **écran de fumée jetable**, écrit le 30/07/2026 pour
prouver que `src/lib/game/` s'exécute bien sous Hermes (les tests, eux, tournent
sous Node). Il n'a aucun rapport avec l'UI visée et **doit être supprimé** quand
les 4 vrais écrans arrivent.

Commandes : `npm test` (vitest, sans simulateur), `npm run typecheck`,
`npm start` (Metro — puis ouvrir `exp://127.0.0.1:8081` dans Expo Go).

État de la migration et décisions :
[`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md).
