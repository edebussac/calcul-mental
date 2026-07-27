<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cette app web est un banc d'essai, pas la cible

La cible est une **app mobile native** (iOS puis Android, probablement Expo /
React Native). Cette version Next.js sert à développer et à éprouver la logique
de jeu. **Tout ce qui n'est pas dans `lib/game/` est jetable.**

Conséquences, à respecter dans tout changement :

- **Toute décision de jeu va dans `lib/game/`**, avec un test unitaire.
  Ces modules doivent rester du **TypeScript pur** : aucun import hors
  `lib/game/`, aucun `window` / `document` / `localStorage` / `fetch` /
  `navigator` / `next/`. C'est ce qui rend la migration gratuite.
- `components/` et `app/` ne font qu'**afficher et saisir**. Ne pas y investir
  de style, d'animations ni de responsive.
- **Ne jamais laisser une constante de règles de jeu dans `components/`** — elle
  ne migrera pas, et la changer rend les scores historiques incomparables.
  (`FEEDBACK_MS` dans `components/Game.tsx` est un cas connu à corriger.)
- Les temps de réponse mesurés sur navigateur desktop ne valent pas ceux d'un
  pavé tactile : prudence avant de régler les constantes de timing de
  `ADAPTIVE_PARAMS` sur des données web.

Contexte complet, pièges et décisions en attente :
[`MIGRATION-MOBILE.md`](MIGRATION-MOBILE.md).
