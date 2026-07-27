/**
 * Suivi de l'inactivité pendant une question, pur et testable.
 *
 * Un temps de réponse long veut dire deux choses opposées : soit l'enfant
 * bataille sur un calcul difficile (le signal le plus précieux du modèle), soit
 * il a posé le téléphone (du bruit). On les sépare par l'ACTIVITÉ : tout appui
 * sur le pavé — chiffre, ⌫ ou C, peu importe qu'il rapproche ou non de la bonne
 * réponse — remet le compteur d'inactivité à zéro.
 *
 * Ce qu'on retient d'une question, c'est donc la plus longue plage SANS aucun
 * appui. Au-delà de `idleCapMs`, la tentative est écartée du modèle ; en deçà,
 * elle est conservée même si elle a duré 30 s.
 */

export interface Activity {
  /** Horodatage (ms) du dernier signe de vie : affichage de la question, ou appui. */
  lastAt: number;
  /** Plus longue plage d'inactivité CLOSE observée jusqu'ici (ms). */
  closedMaxIdleMs: number;
}

/** Démarre le suivi : l'affichage de la question compte comme point de départ. */
export function startActivity(now: number): Activity {
  return { lastAt: now, closedMaxIdleMs: 0 };
}

/** Un appui : clôt la plage d'inactivité en cours et repart de zéro. */
export function registerActivity(activity: Activity, now: number): Activity {
  return {
    lastAt: now,
    closedMaxIdleMs: Math.max(activity.closedMaxIdleMs, now - activity.lastAt),
  };
}

/**
 * Plus longue plage d'inactivité à l'instant `now`, plage EN COURS comprise.
 * À utiliser pour lire la valeur : `closedMaxIdleMs` seul ignore le silence
 * qui a commencé au dernier appui et n'est pas encore refermé.
 */
export function maxIdle(activity: Activity, now: number): number {
  return Math.max(activity.closedMaxIdleMs, now - activity.lastAt);
}
