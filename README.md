# Calcul mental

Petite PWA d'entraînement au calcul mental (MVP : tables de multiplication 1–10).
Next.js + TypeScript, Postgres (Drizzle), tests Vitest + Playwright.

## Démarrage

```bash
npm install
cp .env.example .env.local   # renseigne DATABASE_URL (Neon)
npm run db:migrate           # crée les tables
npm run dev                  # http://localhost:3000
```

Sur iPhone : ouvrir l'URL dans Safari → Partager → « Sur l'écran d'accueil ».

## Base de données

- Schéma : [`lib/db/schema.ts`](lib/db/schema.ts) — `profiles`, `sessions`, `answers`.
- Migrations SQL versionnées dans `drizzle/` (`npm run db:generate` après modif du schéma).
- Provider recommandé : [Neon](https://neon.tech) (tier gratuit).

## Architecture

- `lib/game/` — logique de jeu **pure** (génération, score, série), sans React ni DB.
- `lib/services/` — accès DB, reçoivent la connexion en paramètre (testable).
- `app/api/` — route handlers minces (`profiles`, `sessions`, `scores`).
- `components/`, `app/` — UI (accueil, jeu, scores).

## Tests

```bash
npm run test        # unitaires (logique) + intégration (services sur PGlite)
npm run test:e2e    # parcours de jeu (Playwright, iPhone)
npm run typecheck
```

Pour l'e2e la première fois : `npx playwright install chromium`.

## Déploiement

Importer le repo sur [Vercel](https://vercel.com), définir `DATABASE_URL`, déployer.
Les migrations se lancent via `npm run db:migrate` (ou un script de build).

## Feuille de route

- **v2** : autres opérations, niveaux, classements, objectif quotidien, progrès.
- **v3** : PIN par profil, mode hors-ligne.
