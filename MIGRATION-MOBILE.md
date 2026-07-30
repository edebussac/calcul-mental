# Migration vers une app mobile native

> **Statut : migration engagée (30/07/2026).** L'analyse initiale date du
> **27/07/2026** ; la techno et le modèle de données sont désormais tranchés
> (§10). L'étape 1 du plan §8 est faite : le projet Expo vit dans `native/`.
> Le calendrier, lui, reste ouvert.

## 1. L'objectif

Une vraie app **iPhone**, puis **Android**. La version Next.js actuelle n'est pas
la cible : elle devient un **banc d'essai** assumé.

## 2. La stratégie retenue : continuer sur le web, migrer plus tard

L'approche est valide — mais pour une raison légèrement différente de l'intuition
de départ.

Le cerveau du jeu **ne dépend pas de la version web pour être testé** :
`npm test` n'ouvre aucun navigateur, il exécute du TypeScript pur. Ces tests
tourneront à l'identique dans un projet Expo.

Ce que la version web apporte réellement, c'est un **terrain de jeu rapide pour
sentir les décisions de gameplay** : est-ce que le ciblage adaptatif propose des
questions pertinentes ? est-ce que la progression motive ?

**Corollaire pratique — c'est le point le plus actionnable de ce document : tout
ce qui n'est pas dans `lib/game/` est jetable.** Ne pas investir dans le
Tailwind, les animations, le responsive.

## 3. Ce qui migre, ce qui ne migre pas

Vérifié par inspection du code le 27/07/2026.

| Migre gratuitement | À refaire |
| --- | --- |
| `lib/game/` (~510 lignes) | `components/`, `app/` (~890 lignes d'UI) |
| `tests/unit/` | `tests/e2e/` (Playwright) |
| La **forme** du schéma (tables / colonnes) | Le code Drizzle/pg, `lib/services/`, `app/api/` |

### Le cerveau est déjà portable

Les 5 modules de `lib/game/` (`engine`, `adaptive`, `generator`, `operations`,
`activity`) n'importent **que d'autres modules de `lib/game/`**. Aucun `window`,
`document`, `localStorage`, `fetch`, `navigator`, ni `next/`.

C'est du TypeScript pur : il tournera tel quel en React Native. Le cerveau n'a
**pas** à être rendu portable, il l'est déjà.

`lib/game/activity.ts` illustre le bon réflexe : le calcul du `maxIdleMs`
(distinguer « calcul difficile » de « enfant parti ») aurait pu vivre dans
`Game.tsx` ; il a été sorti dans un module pur et testable. **C'est cette
discipline qui rend la migration gratuite.**

### La règle à tenir

> Toute nouvelle **décision de jeu** va dans `lib/game/`, avec un test unitaire.
> `components/` et `app/` ne contiennent que de l'affichage et de la saisie.

Garde-fou possible (non implémenté) : un test d'une dizaine de lignes qui échoue
si un module de `lib/game/` importe quoi que ce soit d'extérieur — transforme la
règle implicite en filet automatique.

## 4. Les trois pièges identifiés

### 4.1 Polir l'UI web

Traiter `app/` et `components/` comme un banc d'essai, pas comme un produit.
Chaque heure de style est une heure jetée.

### 4.2 Les données d'entraînement polluées

`ADAPTIVE_PARAMS` (dans `lib/game/adaptive.ts`) est calibré en millisecondes sur
des temps de réponse humains :

```ts
idleCapMs: 10_000,  slowCapMs: 15_000,
fastRefMs: 1500,    slowRefMs: 6000,
```

Répondre « 56 » au clavier d'un Mac et sur un pavé tactile au pouce, ce ne sont
pas les mêmes temps. **L'historique accumulé aujourd'hui sur desktop est de la
donnée d'entraînement polluée** pour un modèle qui tournera sur téléphone.

- ✅ **Atténuation réelle** : `playerRefs()` s'auto-calibre par percentiles
  (p25 / p90) dès 5 faits mesurés. `fastRefMs` et `slowRefMs` s'adapteront donc
  seuls au support.
- ⚠️ **Atténuation partielle** : `idleCapMs` et `slowCapMs` sont des écrêtages
  **absolus**, non calibrés. Et surtout, un historique mêlant sessions desktop et
  mobile **fausse les percentiles eux-mêmes**.

> **Tranché le 30/07/2026 : colonne `platform` ajoutée** (migration
> `0003_stale_killer_shrike.sql`). Les parties déjà en base sont étiquetées
> `web` par le `DEFAULT` — elles viennent bien du banc d'essai. Le natif écrira
> `ios` / `android`. Aucun filtre ne s'appuie encore dessus : on enregistre la
> provenance tant qu'elle est connaissable, l'exploiter reste possible à tout
> moment.

**Décision, pour mémoire :** soit considérer les données actuelles comme jetables
et repartir d'une base vide sur mobile (le plus simple), soit ajouter **dès
maintenant** une colonne `platform` sur `sessions`. Cette seconde option coûte
une migration aujourd'hui et devient **irrattrapable après coup**. C'est celle
qui a été retenue, précisément parce que l'autre est toujours accessible ensuite
(ignorer une colonne est gratuit ; reconstituer une provenance perdue, non).

### 4.3 Les paramètres de gameplay cachés dans la couche jetable

Voir le cas `FEEDBACK_MS` en §6.1. Une constante de règles de jeu posée dans
`components/` est un piège double : elle ne migre pas, et elle rend les scores
historiques incomparables si on la change.

## 5. Choix de techno — recommandation, non décidée

### Recommandé : Expo / React Native

Vraie app native (vraies vues, vrai clavier, vrai Taptic Engine), **un seul code
pour iOS et Android**, TypeScript / logique / tests conservés.

Compromis honnête : changement de vocabulaire UI (`<div>` → `<View>`,
Tailwind → `StyleSheet`), builds via EAS.

### Écartées

| Option | Raison |
| --- | --- |
| **Capacitor** (emballer l'existant) | Reste une webview : scroll caoutchouteux, clavier instable, refus fréquent sur l'App Store pour « site web emballé ». C'est exactement le « faux » qu'on veut quitter. |
| **Swift / SwiftUI natif** | Meilleure qualité iOS possible, mais réécriture à 100 %, perte des tests, et Android = second projet from scratch. Surdimensionné ici. |

### Données : local d'abord, synchronisable ensuite

L'archi actuelle envoie chaque partie à un Postgres cloud. Pour une app mobile
d'entraînement, **c'est le mauvais modèle** : la base doit être **locale
(SQLite / `expo-sqlite`)**. L'app marche en avion, et le jeu ne dépend plus du
réseau.

⚠️ **Nuance ajoutée le 30/07/2026.** Le partage des résultats (§11) impose un
serveur. La base locale n'est donc pas *exclusive* mais **prioritaire** : elle
est la source de vérité, le serveur n'est qu'une destination de synchro. Le
backend et l'hébergement ne disparaissent pas — ils cessent d'être sur le
chemin critique d'une partie.

Le schéma actuel (`profiles`, `sessions`, `answers`) migre **en forme** :
`serial` → integer autoincrement, `timestamp` → texte ou entier,
`boolean` → entier. Le travail de modélisation déjà fait n'est pas perdu.

## 6. Problèmes ouverts sur la version actuelle

### 6.1 Le gel de 350 ms après une bonne réponse — ✅ corrigé

> **Corrigé** (option 2). `FEEDBACK_MS` et `lockRef` ont disparu de
> `components/Game.tsx` : la question suivante est posée dans le même tick que
> la validation, et le flash vert est une animation CSS qui ne bloque rien.
> Couvert par « n'impose aucun temps mort entre deux questions »
> (`tests/component/Game.test.tsx`).

**Le problème, avant correctif.** `FEEDBACK_MS = 350` (`components/Game.tsx`).
Dès la bonne réponse, `lockRef.current = true`, et la question suivante
n'arrivait que 350 ms plus tard. Pendant ce temps, les appuis n'étaient **pas
mis en file d'attente : ils étaient jetés**.

> Ironie : le commit `b31a46f` (« chiffres perdus en tapant vite ») a corrigé ce
> problème pour l'état React, mais le verrou continue d'en perdre.

**Impact chiffré :** à 40 réponses/minute, 40 × 350 ms = **14 s de gel sur un
round de 60** — près d'un quart de la partie où l'app n'écoute pas.

**Pourquoi ce n'est pas de l'UI :** cette constante fait partie des **règles de
score**. Elle plafonne mécaniquement le nombre de réponses par minute.

- La même décision se reposera à l'identique en React Native — le natif ne
  résout rien ici.
- La changer rend **tous les scores passés incomparables aux nouveaux**.

✅ Ce que ça ne casse **pas** : le modèle adaptatif. `responseMs` se mesure depuis
`questionStart`, les temps par fait restent justes. Seul le score est faussé.

**Options** envisagées, de la plus timide à la plus juste :

1. Baisser à ~120 ms.
2. **Ne plus bloquer du tout** : basculer la question immédiatement, le flash
   vert devient une animation non bloquante sur la réponse précédente.
   *(retenue)*
3. Compromis : verrou très court (~80 ms) mais **bufferiser** les appuis au lieu
   de les jeter.

L'option 2 a l'avantage de **supprimer** la constante au lieu de la déplacer :
il ne reste aucun paramètre de gameplay caché dans `components/`, ce que
redoutait le §4.3.

### 6.2 Impossible de taper deux chiffres à la fois — ✅ corrigé

> **Corrigé.** `components/Keypad.tsx` déclenche sur `onPointerDown`. Le clic
> reste branché pour le clavier (Entrée / Espace), reconnaissable à son
> `detail === 0` — au doigt ou à la souris il vaut au moins 1, ce qui évite de
> compter l'appui deux fois. Couvert par 4 tests dans
> `tests/component/Keypad.test.tsx` : contact, chevauchement ordonné, clavier,
> et non-doublon.

**Le problème, avant correctif.** `components/Keypad.tsx` utilisait `onClick`,
qui ne se déclenche qu'au **relâchement**, sur le même élément que l'appui.
D'où :

- **Latence** : le chiffre s'enregistrait au relever du doigt, jamais au contact.
- **Multi-touch cassé** : poser le 6 avant d'avoir relâché le 5 ne produisait
  souvent aucun `click` pour le second.

**Correctif web :** `onClick` → `onPointerDown`. Les pointer events sont émis par
pointeur : deux doigts = deux événements indépendants, et le chiffre part au
contact. `touch-action: manipulation` était déjà en place dans `app/globals.css`.

⚠️ **Ce que les tests ne prouvent pas.** `fireEvent.pointerDown` sous jsdom est
une simulation. Le chevauchement réel de deux doigts sur une dalle tactile n'est
pas vérifié, et ne peut pas l'être en e2e : Playwright ne pilote qu'un seul point
de contact. Cf. §9 — ça se valide avec un téléphone en main.

## 7. Exigences durables pour l'app native

Le code du pavé est jetable ; **l'exigence qu'il révèle ne l'est pas.**

> Un chiffre s'enregistre **au contact** (pas au relâchement), et deux touches
> doivent être pressables **indépendamment**.

### Le besoin réel n'est pas la simultanéité

Pour taper « 56 » il faut le 5 **puis** le 6. Deux touchers rigoureusement
simultanés n'ont aucun ordre défini — inutilisable pour saisir un nombre.

Le vrai besoin est le **chevauchement ordonné** :

1. le chiffre part au contact ;
2. poser le 6 pendant que le 5 est enfoncé ne perd rien ;
3. l'ordre est celui des contacts.

### Ce n'est un critère de choix pour aucune plateforme

Vérifié le 27/07/2026 — la friction existe partout, et se règle partout :

| Plateforme | Situation |
| --- | --- |
| **Web** | `onClick` ne suffit pas → `onPointerDown`. |
| **React Native** | La règle « un seul responder » arbitre **quelle vue gagne un toucher**, pas le nombre de doigts : la doc officielle confirme qu'il peut y avoir plusieurs touchers simultanés. Les `Pressable` par défaut sérialisent, mais `react-native-gesture-handler` (`simultaneousHandlers`, `Gesture.Simultaneous()`) le règle — et cette lib est déjà présente, React Navigation est bâti dessus. |
| **SwiftUI** | Même friction : `TapGesture` ne configure que le **nombre de taps, pas le nombre de doigts** → il faut redescendre à UIKit. |

**Conclusion : le multi-touch demande partout de sortir du composant bouton
naïf. Ce n'est donc pas un argument pour ou contre une techno.**

## 8. Plan de migration (le jour venu)

**Étape 0 — prérequis** *(hors code)*
- Xcode installé (gros téléchargement, à lancer en avance).
- Tester sur son iPhone : un **Apple ID gratuit suffit**.
- Publier sur TestFlight / App Store : compte Apple Developer, **99 €/an**.
  Pas nécessaire avant l'étape 5.

**Étape 1 — squelette** (~30 min) — Projet Expo + TypeScript. `lib/game/` et les
tests unitaires recopiés à l'identique ; `npm test` doit passer vert
immédiatement. *C'est le test qui prouve que la logique est bien découplée.*

**Étape 2 — persistance locale** — `expo-sqlite`, 3 tables reprises du schéma
Drizzle, **`platform` et `client_uuid` compris** (§11). Les fonctions de
`lib/services/` gardent leur signature, seule l'implémentation change. Chaque
partie tire son `clientUuid` (`expo-crypto`) et écrit `platform: "ios"`.

**Étape 3 — UI** — Les 4 écrans (accueil, jeu, scores, résultats) en React
Native. Pavé numérique natif, haptique via `expo-haptics` (vrai retour Taptic, en
remplacement du hack `<input switch>` de `lib/haptics.ts`).

**Étape 4 — sur l'iPhone** — Expo Go d'abord (scan d'un QR code), puis build de
dev installé en dur.

**Étape 5 — publication** — Icône, écran de lancement, build EAS, TestFlight,
App Store. ~1 semaine de review la première fois.

**Étape 6 — Android** — `eas build --platform android`. Compte Google Play :
**25 $ une seule fois**.

Garder le repo Next.js intact comme référence pendant la migration, quitte à
l'archiver ensuite.

## 9. Ce qui ne peut pas être validé avant d'avoir un téléphone en main

- Le ressenti de la saisie et sa latence réelle.
- L'haptique.
- La taille du pavé sous le pouce.

**→ Ne pas sur-optimiser à l'aveugle les constantes de timing.** Elles se règlent
avec un vrai appareil.

## 10. Décisions

Les trois premières ont été tranchées le **30/07/2026**, la veille de la
migration.

- [x] Techno : **Expo / React Native**.
- [x] Données : **100 % local en v1, schéma prêt pour la sync**. Aucun réseau
      dans l'app native au premier jour ; les deux colonnes que la sync exigera
      sont déjà posées (§11).
- [x] Historique : **conservé et étiqueté** — colonne `platform`, cf. §4.2.
- [x] Corriger `FEEDBACK_MS` sur la version actuelle — **fait**, voir §6.1.
- [x] Passer le pavé à `onPointerDown` sur la version actuelle — **fait**,
      voir §6.2. Reste à confirmer sur un vrai téléphone.

Restent ouvertes, et **volontairement** : voir la fin du §11.

## 11. Partager les résultats

> **Statut : socle posé le 30/07/2026, fonctionnalité non commencée.**

Le calcul mental n'est pas réservé aux enfants : la cible inclut les **adultes**.
Et les résultats doivent pouvoir être **partagés entre utilisateurs**.

### Ce que ça change — et ce que ça ne change pas

Un partage entre utilisateurs impose un serveur : deux téléphones ne se voient
pas. Mais ça ne remet pas en cause le local-first du §5. L'ordre est :

1. la partie s'écrit en SQLite, immédiatement, hors ligne ;
2. plus tard, quand le réseau est là, elle est **poussée** vers le serveur.

**Le téléphone pousse seulement, il ne lit jamais son propre historique depuis
le serveur.** C'est ce qui évite toute fusion bidirectionnelle — la classe de
bug la plus coûteuse d'une synchro.

### Les deux colonnes posées d'avance (migration `0003`)

Elles ne servent à rien aujourd'hui. Elles sont là parce que les ajouter plus
tard voudrait dire **migrer des téléphones déjà utilisés par des enfants**.

| Colonne | Pourquoi elle ne peut pas attendre |
| --- | --- |
| `sessions.platform` | Cf. §4.2. Une session déjà écrite ne peut plus dire d'où elle vient. |
| `sessions.client_uuid` | En SQLite local, deux téléphones produisent chacun une session `id = 1`. C'est lui, pas `id`, qui identifie une partie à la synchro : un renvoi après échec réseau ne crée alors pas de doublon. |
| `profiles.client_uuid` | Reconnaître un profil créé hors ligne autrement que par son prénom. |

Le web les renseigne déjà (`platform: "web"`, un UUID par partie) — ce qui les
maintient testées et vivantes d'ici la migration.

### Choix assumés, à ne pas sur-construire

- **Cercle privé d'abord** (famille, amis). Le score est calculé par le client :
  c'est intenable pour un classement public, sans importance entre gens qui se
  connaissent. Un classement public honnête viendra plus tard, ou pas.
- **Pas d'authentification.** Un profil reste un prénom. C'est cohérent avec le
  cercle privé, et récupérable à tout moment.
- **Pas de segmentation du classement.** Noté quand même : un adulte au clavier
  écrase mécaniquement un enfant au pouce (§4.2). Si le classement décourage au
  lieu de motiver, `platform`, `operation` et `level` sont déjà en base pour
  segmenter sans migration.

### Ouvert, et sans urgence

Tout ce qui suit est **additif** — rien ne se perd à attendre :

- L'upsert idempotent sur `client_uuid` côté serveur : la colonne est posée,
  elle n'est pas encore exploitée.
- La route de classement et l'UI de partage.
- La notion d'**élève / classe** : un regroupement au-dessus des profils, donc
  une table de plus, pas une refonte.
- Lever l'unicité de `profiles.name` — inévitable hors du cercle familial (deux
  « Emma »), mais un simple `DROP CONSTRAINT` le jour venu.

## Sources

- [Gesture Responder System — React Native](https://reactnative.dev/docs/gesture-responder-system)
- [Cross handler interactions — React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/gesture-handlers/interactions/)
- [Multi-finger taps in SwiftUI](https://fatbobman.com/en/snippet/enable-multi-finger-tap-gestures-in-swiftui/)
