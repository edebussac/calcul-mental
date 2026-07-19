/**
 * Sélection adaptative des multiplications ("points faibles"), pure et testable.
 *
 * Modèle hybride (voir plan) : la difficulté d'un fait est estimée par une
 * moyenne mobile exponentielle SUR LES TENTATIVES (robuste à un jeu irrégulier),
 * modulée par une confiance liée au nombre de tentatives, plus un léger bonus de
 * révision temporel. Tirage pondéré avec plancher (interleaving), ratio borné
 * (aucun fait ne monopolise) et jitter (variété).
 */

import { computeAnswer, type Question } from "./generator";

/** Stats d'un fait = paire non ordonnée (a ≤ b). */
export interface FactStat {
  a: number;
  b: number;
  /** Temps récents (ms), du PLUS RÉCENT au plus ancien, déjà cappés (≤ CAP). */
  recentMs: number[];
  /** Jours depuis la dernière tentative ; `undefined` si jamais vu. */
  lastSeenDays?: number;
}

export interface WeightedFact {
  a: number;
  b: number;
  weight: number;
}

export interface AdaptiveParams {
  /** Cap au-delà duquel un temps est ignoré (absence). */
  capMs: number;
  /** Nb max de tentatives conservées par fait. */
  window: number;
  /** Décroissance EMA par tentative (0<β<1). */
  beta: number;
  /** Seuils absolus de repli si trop peu de données pour normaliser. */
  fastRefMs: number;
  slowRefMs: number;
  /** Échelle de confiance : confiance = 1 − exp(−n/confScale). */
  confScale: number;
  /** Demi-vie (jours) du besoin de révision. */
  reviewHalfLifeDays: number;
  /** Poids de base (tout fait garde une chance → interleaving). */
  floor: number;
  /** Poids de la difficulté (dominant). */
  difficultyWeight: number;
  /** Poids de la révision (secondaire, temporel). */
  reviewWeight: number;
  /** Poids de l'exploration (faits peu connus / jamais vus). */
  explorationWeight: number;
  /** Ratio max poids fort / poids faible. */
  ratioMax: number;
  /** Amplitude du jitter (0,1 → ±10 %). */
  jitter: number;
}

export const ADAPTIVE_PARAMS: AdaptiveParams = {
  capMs: 10_000,
  window: 10,
  beta: 0.6,
  fastRefMs: 1500,
  slowRefMs: 6000,
  confScale: 5,
  reviewHalfLifeDays: 10,
  floor: 1,
  difficultyWeight: 4,
  reviewWeight: 1.5,
  explorationWeight: 2,
  ratioMax: 5,
  jitter: 0.1,
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Clé canonique d'un fait (paire triée). */
export function factKey(a: number, b: number): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `${lo}x${hi}`;
}

/** Les 55 faits {a,b} avec a ≤ b, opérandes dans [min,max]. */
export function multiplicationFacts(min = 1, max = 10): { a: number; b: number }[] {
  const facts: { a: number; b: number }[] = [];
  for (let a = min; a <= max; a++) {
    for (let b = a; b <= max; b++) facts.push({ a, b });
  }
  return facts;
}

/** Moyenne mobile exponentielle sur les tentatives (récent en tête). */
export function emaResponseMs(recentMs: number[], beta: number): number | null {
  if (recentMs.length === 0) return null;
  let num = 0;
  let den = 0;
  let w = 1;
  for (const ms of recentMs) {
    num += w * ms;
    den += w;
    w *= beta;
  }
  return num / den;
}

/** Confiance 0..1 selon le nombre de tentatives conservées. */
export function confidence(n: number, scale: number): number {
  return 1 - Math.exp(-n / scale);
}

/** Difficulté brute 0..1 : rapide → 0, lent → 1. */
export function difficulty(rtMs: number, fastRefMs: number, slowRefMs: number): number {
  if (slowRefMs <= fastRefMs) return 0;
  return clamp((rtMs - fastRefMs) / (slowRefMs - fastRefMs), 0, 1);
}

/** Besoin de révision 0..1 (temps). 0 pour un fait jamais vu (l'exploration s'en charge). */
export function reviewNeed(
  lastSeenDays: number | undefined,
  halfLifeDays: number,
): number {
  if (lastSeenDays === undefined) return 0;
  return 1 - Math.pow(0.5, lastSeenDays / halfLifeDays);
}

/** Références de normalisation propres au joueur (repli sur seuils absolus). */
export function playerRefs(
  rts: number[],
  params: AdaptiveParams,
): { fastRefMs: number; slowRefMs: number } {
  if (rts.length < 5) {
    return { fastRefMs: params.fastRefMs, slowRefMs: params.slowRefMs };
  }
  const sorted = [...rts].sort((x, y) => x - y);
  const pct = (p: number) =>
    sorted[clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1)];
  const fast = pct(0.25);
  const slow = pct(0.9);
  // Garde un écart minimal pour éviter une normalisation dégénérée.
  return { fastRefMs: fast, slowRefMs: Math.max(slow, fast + 500) };
}

/**
 * Construit le pool pondéré à partir des stats par fait (les faits absents de
 * `stats` sont considérés jamais vus). Poids borné en ratio.
 */
export function buildFactPool(
  stats: FactStat[],
  params: AdaptiveParams = ADAPTIVE_PARAMS,
  allFacts: { a: number; b: number }[] = multiplicationFacts(),
): WeightedFact[] {
  const byKey = new Map<string, FactStat>();
  for (const s of stats) byKey.set(factKey(s.a, s.b), s);

  // EMA par fait (pour les références joueur).
  const rtByKey = new Map<string, number>();
  for (const [key, s] of byKey) {
    const rt = emaResponseMs(s.recentMs, params.beta);
    if (rt !== null) rtByKey.set(key, rt);
  }
  const refs = playerRefs([...rtByKey.values()], params);

  const raw: WeightedFact[] = allFacts.map(({ a, b }) => {
    const key = factKey(a, b);
    const s = byKey.get(key);
    const n = s ? s.recentMs.length : 0;
    const rt = rtByKey.get(key) ?? null;

    const conf = confidence(n, params.confScale);
    const diffBrute = rt === null ? 0 : difficulty(rt, refs.fastRefMs, refs.slowRefMs);
    const diffFinal = conf * diffBrute;
    const exploration = 1 - conf;
    const review = reviewNeed(s?.lastSeenDays, params.reviewHalfLifeDays);

    const weight =
      params.floor +
      params.difficultyWeight * diffFinal +
      params.reviewWeight * review +
      params.explorationWeight * exploration;

    return { a, b, weight };
  });

  // Bornage du ratio : aucun fait ne monopolise.
  const wMin = Math.min(...raw.map((f) => f.weight));
  const cap = wMin * params.ratioMax;
  return raw.map((f) => ({ ...f, weight: Math.min(f.weight, cap) }));
}

/**
 * Tire un fait dans le pool : jitter ±, exclusion des faits récemment posés,
 * échantillonnage proportionnel au poids. `rng` injectable pour les tests.
 */
export function pickFact(
  pool: WeightedFact[],
  rng: () => number = Math.random,
  exclude: string[] = [],
  params: AdaptiveParams = ADAPTIVE_PARAMS,
): { a: number; b: number } {
  const excluded = new Set(exclude);
  let candidates = pool.filter((f) => !excluded.has(factKey(f.a, f.b)));
  if (candidates.length === 0) candidates = pool;

  const jittered = candidates.map((f) => {
    const factor = 1 - params.jitter + rng() * 2 * params.jitter;
    return { f, w: Math.max(f.weight * factor, 1e-9) };
  });

  const total = jittered.reduce((sum, j) => sum + j.w, 0);
  let r = rng() * total;
  for (const { f, w } of jittered) {
    r -= w;
    if (r <= 0) return { a: f.a, b: f.b };
  }
  const last = jittered[jittered.length - 1].f;
  return { a: last.a, b: last.b };
}

/** Analyse d'un fait, pour affichage (classement des moins maîtrisés). */
export interface FactAnalysis {
  a: number;
  b: number;
  /** Nb de tentatives récentes prises en compte (≤ 10, déjà limité en amont). */
  attempts: number;
  /** Temps moyen SIMPLE (non pondéré) des tentatives récentes, en ms. */
  avgMs: number;
  lastSeenDays?: number;
}

/**
 * Classe les faits **déjà tentés** du plus lent au plus rapide, par simple
 * moyenne arithmétique de leurs tentatives récentes (pas de pondération par
 * récence ni de confiance) — pour affichage (« calculs à travailler »).
 */
export function analyzeFacts(stats: FactStat[]): FactAnalysis[] {
  const withData = stats.filter((s) => s.recentMs.length > 0);

  const analyzed: FactAnalysis[] = withData.map((s) => ({
    a: s.a,
    b: s.b,
    attempts: s.recentMs.length,
    avgMs: s.recentMs.reduce((sum, ms) => sum + ms, 0) / s.recentMs.length,
    lastSeenDays: s.lastSeenDays,
  }));

  return analyzed.sort((x, y) => y.avgMs - x.avgMs);
}

/** Construit une Question à partir d'un fait, ordre d'affichage randomisé. */
export function factToQuestion(
  fact: { a: number; b: number },
  rng: () => number = Math.random,
): Question {
  const swap = rng() < 0.5;
  const a = swap ? fact.b : fact.a;
  const b = swap ? fact.a : fact.b;
  return {
    a,
    b,
    operation: "multiplication",
    answer: computeAnswer("multiplication", a, b),
  };
}
