import { describe, it, expect } from "vitest";
import {
  maxIdle,
  registerActivity,
  startActivity,
} from "@/lib/game/activity";

/** Rejoue une suite d'appuis (horodatages ms) depuis l'affichage à t=0. */
function play(taps: number[], end: number): number {
  const activity = taps.reduce(
    (acc, at) => registerActivity(acc, at),
    startActivity(0),
  );
  return maxIdle(activity, end);
}

describe("suivi de l'inactivité", () => {
  it("vaut 0 quand rien ne s'est écoulé", () => {
    expect(maxIdle(startActivity(0), 0)).toBe(0);
  });

  it("compte le silence entre l'affichage et le premier appui", () => {
    expect(play([4000], 4000)).toBe(4000);
  });

  it("retient la PLUS LONGUE plage, pas la dernière", () => {
    // Appuis à 1 s, 9 s, 10 s : le trou de 8 s domine.
    expect(play([1000, 9000, 10_000], 10_000)).toBe(8000);
  });

  it("remet le compteur à zéro à chaque appui", () => {
    // 25 s au total mais une frappe toutes les 5 s : jamais plus de 5 s de silence.
    const taps = [5000, 10_000, 15_000, 20_000, 25_000];
    expect(play(taps, 25_000)).toBe(5000);
  });

  it("inclut la plage EN COURS, non refermée par un appui", () => {
    const activity = registerActivity(startActivity(0), 1000);
    // Dernier appui à 1 s, on interroge à 30 s : 29 s de silence en cours.
    expect(maxIdle(activity, 30_000)).toBe(29_000);
    // …que `closedMaxIdleMs` seul manquerait.
    expect(activity.closedMaxIdleMs).toBe(1000);
  });

  it("distingue les deux profils de temps long", () => {
    const IDLE_CAP = 10_000;
    // Bloqué mais il cherche : 24 s, frappes régulières → exploitable.
    const acharne = play([3000, 7000, 11_000, 16_000, 20_000, 24_000], 24_000);
    expect(acharne).toBeLessThanOrEqual(IDLE_CAP);
    // Parti jouer : même durée, deux appuis collés au début → écarté.
    const absent = play([500, 900], 24_000);
    expect(absent).toBeGreaterThan(IDLE_CAP);
  });

  it("est pur (ne mute pas l'état d'entrée)", () => {
    const before = startActivity(0);
    registerActivity(before, 5000);
    expect(before).toEqual({ lastAt: 0, closedMaxIdleMs: 0 });
  });
});
