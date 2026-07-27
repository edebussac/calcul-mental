# Migration vers une app mobile native

> **Statut : analyse, aucune décision prise.** Ce document consigne l'état des
> lieux et les recommandations issues de la réflexion du **27/07/2026**. Rien
> n'est engagé : ni la techno, ni le modèle de données, ni le calendrier.

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

**Décision à prendre :** soit considérer les données actuelles comme jetables et
repartir d'une base vide sur mobile (le plus simple), soit ajouter **dès
maintenant** une colonne `platform` sur `sessions`. Cette seconde option coûte
une migration aujourd'hui et devient **irrattrapable après coup**.

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

### Données : local d'abord

L'archi actuelle envoie chaque partie à un Postgres cloud. Pour une app mobile
d'entraînement, **c'est le mauvais modèle** : la base doit être **locale
(SQLite / `expo-sqlite`)**. L'app marche en avion, et on supprime au passage le
backend, l'hébergement Vercel et le coût Neon.

Le schéma actuel (`profiles`, `sessions`, `answers`) migre **en forme** :
`serial` → integer autoincrement, `timestamp` → texte ou entier,
`boolean` → entier. Le travail de modélisation déjà fait n'est pas perdu.

## 6. Problèmes ouverts sur la version actuelle

### 6.1 Le gel de 350 ms après une bonne réponse — ⚠️ règle de jeu, pas de l'UI

`FEEDBACK_MS = 350` (`components/Game.tsx`). Dès la bonne réponse,
`lockRef.current = true`, et la question suivante n'arrive que 350 ms plus tard.
Pendant ce temps, les appuis ne sont **pas mis en file d'attente : ils sont
jetés**.

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

**Options**, de la plus timide à la plus juste :

1. Baisser à ~120 ms.
2. **Ne plus bloquer du tout** : basculer la question immédiatement, le flash
   vert devient une animation non bloquante sur la réponse précédente.
   *(recommandé)*
3. Compromis : verrou très court (~80 ms) mais **bufferiser** les appuis au lieu
   de les jeter.

Dans tous les cas, `FEEDBACK_MS` doit sortir de `components/` pour rejoindre les
paramètres de jeu testés.

### 6.2 Impossible de taper deux chiffres à la fois — UI, mais exigence durable

`components/Keypad.tsx` utilise `onClick`, qui ne se déclenche qu'au
**relâchement**, sur le même élément que l'appui. D'où :

- **Latence** : le chiffre s'enregistre au relever du doigt, jamais au contact.
- **Multi-touch cassé** : poser le 6 avant d'avoir relâché le 5 ne produit
  souvent aucun `click` pour le second.

**Correctif web :** `onClick` → `onPointerDown`. Les pointer events sont émis par
pointeur : deux doigts = deux événements indépendants, et le chiffre part au
contact. `touch-action: manipulation` est déjà en place dans `app/globals.css`.

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
Drizzle. Les fonctions de `lib/services/` gardent leur signature, seule
l'implémentation change.

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

## 10. Décisions en attente

- [ ] Techno : Expo confirmé ?
- [ ] Données : 100 % local / local + sync plus tard / garder le backend ?
- [ ] Historique : repartir de zéro, ou ajouter une colonne `platform`
      maintenant ? *(irrattrapable après coup)*
- [ ] Corriger `FEEDBACK_MS` et le passage à `onPointerDown` sur la version
      actuelle ?

## Sources

- [Gesture Responder System — React Native](https://reactnative.dev/docs/gesture-responder-system)
- [Cross handler interactions — React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/gesture-handlers/interactions/)
- [Multi-finger taps in SwiftUI](https://fatbobman.com/en/snippet/enable-multi-finger-tap-gestures-in-swiftui/)
