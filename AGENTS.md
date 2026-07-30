<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# La racine du dépôt est le banc d'essai web, pas la cible

La cible est une **app mobile native** — **Expo / React Native, confirmé le
30/07/2026**. Elle vit dans [`native/`](native/) et c'est *elle* le produit.
Cette version Next.js sert à éprouver la logique de jeu ; elle disparaîtra quand
le natif l'aura remplacée.

> ⚠️ **Les règles ci-dessous valent pour la racine. Elles ne se transposent pas
> telles quelles dans `native/`** — voir [`native/AGENTS.md`](native/AGENTS.md).
> Le piège est précis : **ici l'UI est jetable, là-bas l'UI *est* le produit.**
> Appliquer « ne pas investir dans l'UI » au projet natif serait sous-investir
> exactement là où il faut investir.

Conséquences, à respecter dans tout changement **à la racine** :

- **Toute décision de jeu va dans `lib/game/`**, avec un test unitaire.
  Ces modules doivent rester du **TypeScript pur** : aucun import hors
  `lib/game/`, aucun `window` / `document` / `localStorage` / `fetch` /
  `navigator` / `next/`.
  *Ce n'est pas une précaution théorique : le 30/07/2026 les 5 modules ont été
  copiés dans `native/` sans une seule modification, et leurs 48 tests sont
  passés verts du premier coup. C'est cette discipline qui l'a permis.*
- `components/` et `app/` ne font qu'**afficher et saisir**. Ne pas y investir
  de style, d'animations ni de responsive.
- **Ne jamais laisser une constante de règles de jeu dans `components/`** — elle
  ne migrera pas, et la changer rend les scores historiques incomparables.
- Les temps de réponse mesurés sur navigateur desktop ne valent pas ceux d'un
  pavé tactile : prudence avant de régler les constantes de timing de
  `ADAPTIVE_PARAMS` sur des données web. La colonne `sessions.platform` existe
  précisément pour pouvoir les distinguer.

Contexte complet, pièges et décisions :
[`MIGRATION-MOBILE.md`](MIGRATION-MOBILE.md).
