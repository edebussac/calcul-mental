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

## L'énoncé à voix haute

`expo-speech` (moteur du système, hors ligne, sans clé). Le partage des rôles
suit celui de l'haptique : **comment on dit une question** est du jeu et vit
dans `src/lib/game/` (`spokenQuestion`, `OPERATION_CONFIG.spokenSymbol`,
testés) ; **faire parler l'appareil** vit dans `src/lib/speech.ts`, en
tiré-et-oublié — une partie se joue au nombre de réponses par minute, rien ne
doit faire attendre la saisie.

Trois pièges, tous rencontrés en écrivant le module :

- **`Speech.speak` empile.** Une bonne réponse tombe souvent avant la fin de la
  lecture ; sans `Speech.stop()` juste avant chaque énoncé, la file s'allonge à
  chaque question et la voix récite en fin de round des calculs résolus dix
  coups plus tôt.
- **L'interrupteur silence de l'iPhone rend la voix muette.** `expo-speech` ne
  configure aucune session audio et hérite de celle de l'app. D'où l'appel à
  `setAudioModeAsync({ playsInSilentMode: true })` (`expo-audio`) dans
  `prepareSpeech()`. Un mobile d'enfant est souvent sur silencieux : sans ça, la
  fonctionnalité passe pour cassée alors que tout marche.
- **Ne pas énoncer les symboles bruts.** Aucune voix ne lit correctement « × »
  ni « − » (U+2212) ; d'où `spokenSymbol` (« fois », « moins »…) à côté de
  `symbol`.

**Vocal et écrit s'excluent** (décidé sur essai réel) : en vocal la question
n'est pas affichée, sinon la voix n'en serait qu'un doublon que l'œil doublerait
toujours. Deux conséquences à ne pas défaire séparément :

- Le **bouton « redire »** de `Game.tsx` n'est pas un confort : sans lui, un
  chiffre mal entendu ne se rattrape plus par aucun moyen. Il ne touche ni au
  chronomètre ni à la saisie, mais compte comme signe de vie (`registerActivity`).
- `isSpeechAvailable()` est interrogé **avant** de masquer l'énoncé : sans partie
  native, masquer laisserait un écran vide et une partie injouable. On retombe
  alors sur l'écrit, et `sessions.voice` enregistre `false` — ce qui s'est
  réellement passé, pas ce qui était réglé.

`sessions.voice` note si la partie a été énoncée — **obligatoire** dans
`saveSession`, exactement comme `platform` et pour la même raison : entendre
l'énoncé change les `response_ms`, et le modèle adaptatif se calibre dessus.
Depuis que l'écrit disparaît en vocal, l'écart entre les deux populations est
d'ailleurs bien plus large qu'au moment où la colonne a été créée.

> ⚠️ **`expo-speech` et `expo-audio` sont des modules natifs.** Les ajouter ne
> se recharge pas dans un build de dev existant : il faut refaire
> `npx expo prebuild` puis le build Xcode ci-dessous.
>
> Constaté : importés en tête de `speech.ts`, leur `requireNativeModule` jette
> **au chargement du module**, ce qui emporte `Game.tsx` puis la route `/play`
> entière. L'app n'annonce alors pas « pas de voix » mais
> `Route "./play/[operation].tsx" is missing the required default export`, et le
> jeu devient injouable — un message qui ne désigne jamais la voix. D'où les
> `require` différés et rattrapés du module : **ne pas les retransformer en
> imports statiques**, un accessoire ne doit pas pouvoir emporter le jeu.

## Le record personnel

Annoncé pendant la partie (bannière + retour haptique au franchissement) et sur
l'écran de résultat. Deux choses à ne pas défaire par simplification :

- **`personalBest` est volontairement plus étroit que `bestScoreFor`.** Le record
  se compte à conditions identiques — opération, **niveau**, mode, énoncé — parce
  qu'on en fait une promesse à l'écran. Élargi à l'opération seule, un record posé
  à Facile rendrait l'annonce inatteignable à Légendaire, et un record posé en
  écrit le resterait en vocal.
- **`null` n'est pas `0`.** « Jamais joué dans ces conditions » et « une partie à
  zéro » donnent deux textes différents, et on n'annonce jamais un record battu à
  qui n'en avait pas. C'est aussi pourquoi l'annonce exige `best >= 1`.

L'annonce ne retient jamais le jeu : bannière en surimpression,
`pointerEvents="none"`, question suivante déjà tirée en dessous — même contrat
que l'écho de la bonne réponse.

**`bestScores` regroupe sur les mêmes quatre clés** et l'écran des scores affiche
une carte par conditions (« Facile · Multiplication », puis « écrit » ou
« vocal »). Les deux vues ne peuvent pas diverger : celle des scores annonce le
record que la partie fera battre. `bestScoreFor`, lui, reste large (l'opération
entière) — il ne sert pas l'affichage des records.

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

Build en signature série, **depuis `ios/`** (et non depuis `native/`, où
`xcodebuild` répond seulement `'Blitzmatic.xcworkspace' does not exist`) :

```bash
xcodebuild -workspace Blitzmatic.xcworkspace -scheme Blitzmatic \
  -configuration Debug -destination "id=<UDID>" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAM_ID> \
  CODE_SIGN_STYLE=Automatic COCOAPODS_PARALLEL_CODE_SIGN=NO
```

`<UDID>` se lit avec `xcrun devicectl list devices`, `<TEAM_ID>` avec
`security find-identity -v -p codesigning` (l'identifiant entre parenthèses est
celui du *certificat*, pas celui de l'équipe — le bon se lit dans le profil de
`~/Library/Developer/Xcode/UserData/Provisioning Profiles/`, clé
`TeamIdentifier`, via `security cms -D -i <profil>`).

> ⚠️ **`DEVELOPMENT_TEAM` sur la ligne de commande, et pas dans Xcode.**
> `npx expo prebuild` régénère `ios/` intégralement : il efface donc l'équipe
> réglée à la souris dans « Signing & Capabilities », et le build suivant
> s'arrête en quelques secondes sur `Signing for "Blitzmatic" requires a
> development team`. Passée en argument, l'équipe survit à toutes les
> régénérations.
>
> Ce genre d'échec **ne compile rien** : si le build rend la main trop vite, y
> voir un problème de configuration plutôt que de code. Et ne jamais tuyauter
> `xcodebuild` dans un `tail` sans relever `$?` — le code de sortie de l'échec
> est alors masqué par celui du `tail`.

puis `xcrun devicectl device install app --device <id> <chemin>/Blitzmatic.app`,
et `npx expo start --dev-client` pour servir le JS.

> ⚠️ **« No script URL provided » au lancement.** Conséquence du contournement
> ci-dessus : installer via `devicectl` plutôt que `expo run:ios` saute l'étape
> où ce dernier indique à l'app où trouver Metro. L'app ne tente alors même pas
> de le contacter — aucune requête ne remonte dans les logs Metro, ce qui le
> distingue d'un vrai problème réseau. Se répare **sur l'iPhone**, dans Safari
> (pas dans l'app), en ouvrant :
>
> ```
> blitzmatic://expo-development-client/?url=http%3A%2F%2F<IP-LAN-du-Mac>%3A8081
> ```
>
> Safari propose d'ouvrir dans Blitzmatic ; accepter. Nécessite Metro déjà
> lancé, et l'iPhone sur le même Wi-Fi que le Mac.

Vérifier avant de conclure à un bug de code — obstacles déjà rencontrés, tous
hors du code : Ruby système trop ancien pour CocoaPods, **mode développeur**
désactivé sur l'iPhone (l'option n'apparaît dans les Réglages qu'après qu'Xcode
a ciblé l'appareil une fois), la signature parallèle, et l'URL de Metro
ci-dessus.

Avec un Apple ID gratuit, le profil **expire au bout de 7 jours** : l'app cesse
de s'ouvrir et doit être réinstallée.

## Commandes

`npm test` (vitest, sans simulateur), `npm run typecheck`, `npm start` (Metro).

État de la migration et décisions :
[`../MIGRATION-MOBILE.md`](../MIGRATION-MOBILE.md).
