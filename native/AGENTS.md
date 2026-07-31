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

## Base de données

SQLite **local** (`expo-sqlite` + Drizzle). Aucun réseau : l'app fonctionne en
avion. Le schéma vit dans `src/lib/db/schema.ts` ; les services de
`src/lib/services/` sont ceux du banc d'essai web, à une exception près
(`saveSession`, cf. son commentaire).

Après toute modification du schéma :

```bash
npm run db:generate
```

Cette commande enchaîne `drizzle-kit generate` **et**
`scripts/build-migrations.mjs`. Ne jamais lancer `drizzle-kit generate` seul :
`src/lib/db/migrations.ts` resterait périmé et l'app appliquerait l'ancien
schéma.

> ⚠️ **Ne pas réintroduire l'import des `.sql` dans le bundle.** Le
> `drizzle/migrations.js` que drizzle-kit produit avec `driver: "expo"` fait
> `import m0000 from './0000_….sql'`, ce que Metro ne sait pas charger. Le
> déclarer dans `resolver.sourceExts` **ne règle rien** : Metro le résout alors,
> mais tente de le parser comme du JavaScript et échoue sur « Missing semicolon »
> dès `CREATE TABLE`. D'où l'inlining dans un `.ts`, et l'absence volontaire de
> `metro.config.js`.

Deux pièges de SQLite déjà rencontrés, à ne pas réintroduire :

- **`lower()` est ASCII.** Il laisse « É » intact, donc comparer des prénoms en
  SQL dupliquait les profils accentués saisis en majuscules. `getProfileByName`
  compare désormais en JavaScript (`toLocaleLowerCase`).
- **Les clés étrangères ne sont pas appliquées par défaut.** Le harnais de test
  pose `PRAGMA foreign_keys = ON` ; toute autre ouverture de base doit le faire
  aussi.

## L'exigence durable du pavé numérique

Reprise du §7 de [`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md) :

> Un chiffre s'enregistre **au contact**, pas au relâchement, et deux touches
> doivent être pressables **indépendamment** — le besoin réel est le
> *chevauchement ordonné* : poser le 6 pendant que le 5 est enfoncé ne doit rien
> perdre, et l'ordre est celui des contacts.

`Pressable` ne convient pas : il déclenche au **relâchement**, et le système de
responder n'attribue le toucher qu'à une seule vue.

> ⚠️ **Ne pas régler ça avec `react-native-gesture-handler`.** C'est la solution
> qu'on attend, et elle **fait planter l'app** dans Expo Go : monter
> `GestureHandlerRootView` ou construire un objet `Gesture` initialise
> `react-native-worklets`, d'où un SIGSEGV natif dans
> `worklets::JSIWorkletsModuleProxy::toOptimizedObject` → `cloneString`. Crash
> natif, non rattrapable côté JS, et le message ne désigne jamais RNGH.
>
> `src/components/Keypad.tsx` s'en passe donc entièrement : **un seul responder**
> pour tout le pavé, qui reçoit tous les touchers et rattache chacun à une touche
> par ses coordonnées. Les touches portent `pointerEvents="none"` pour que
> `locationX/Y` reste relatif au pavé, et chaque doigt est suivi par son
> `identifier` — c'est ce qui donne le chevauchement ordonné.

## Installer sur un iPhone réel

Expo Go **ne convient plus** : il plafonne au SDK que sa version App Store
supporte, et le projet est en SDK 57. Il faut un *build de dev*, qui s'installe
comme une vraie app. `ios/` est régénéré par `npx expo prebuild`, d'où son
absence du dépôt.

> ⚠️ **Ne pas lancer `npx expo run:ios`.** Il passe
> `COCOAPODS_PARALLEL_CODE_SIGN=true`, qui laisse des frameworks **non signés** —
> huit lors du premier build, dont React et Hermes. L'installation échoue alors
> sur `ApplicationVerificationFailed`, et le message ne cite qu'**un seul**
> framework (`ExpoFileSystem` en l'occurrence), ce qui fait chercher du côté
> d'une dépendance fautive au lieu de la signature.

Build en signature série, depuis `ios/` :

```bash
xcodebuild -workspace Blitzmatic.xcworkspace -scheme Blitzmatic \
  -configuration Debug -destination "id=<UDID>" \
  -allowProvisioningUpdates COCOAPODS_PARALLEL_CODE_SIGN=NO
```

puis `xcrun devicectl device install app --device <id> <chemin>/Blitzmatic.app`,
et `npx expo start --dev-client` pour servir le JS.

Vérifier avant de conclure à un bug de code — trois obstacles rencontrés, tous
hors du code : Ruby système trop ancien pour CocoaPods, **mode développeur**
désactivé sur l'iPhone (l'option n'apparaît dans les Réglages qu'après qu'Xcode
a ciblé l'appareil une fois), et la signature parallèle ci-dessus.

Avec un Apple ID gratuit, le profil **expire au bout de 7 jours** : l'app cesse
de s'ouvrir et doit être réinstallée.

## Commandes

`npm test` (vitest, sans simulateur), `npm run typecheck`, `npm start` (Metro).

État de la migration et décisions :
[`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md).
