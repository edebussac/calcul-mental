"use client";

/**
 * Retour haptique multiplateforme.
 *
 * - Android / navigateurs compatibles : Vibration API (`navigator.vibrate`).
 * - iOS Safari : l'API Vibration N'EXISTE PAS. On utilise l'astuce d'un
 *   `<input switch>` (iOS 17.4+) : le basculer déclenche un petit tic haptique.
 *   Doit être appelé dans le contexte d'un geste utilisateur (un tap) — c'est le
 *   cas ici puisqu'on valide sur appui d'une touche.
 */

let switchLabel: HTMLLabelElement | null = null;

function iosSwitchTick(): void {
  if (typeof document === "undefined") return;
  if (!switchLabel) {
    switchLabel = document.createElement("label");
    switchLabel.setAttribute("aria-hidden", "true");
    Object.assign(switchLabel.style, {
      position: "absolute",
      width: "0",
      height: "0",
      opacity: "0",
      overflow: "hidden",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    const input = document.createElement("input");
    input.type = "checkbox";
    // Attribut iOS 17.4+ : rend la case "interrupteur" et émet un haptique.
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    switchLabel.appendChild(input);
    document.body.appendChild(switchLabel);
  }
  // Basculer l'interrupteur déclenche le tic haptique sur iOS.
  switchLabel.click();
}

/** Déclenche une courte vibration/haptique. `durationMs` ignoré sur iOS. */
export function haptic(durationMs = 30): void {
  if (typeof window === "undefined") return;

  const nav = window.navigator;
  if (typeof nav.vibrate === "function") {
    // Renvoie false si non supporté ; on retombe alors sur l'astuce iOS.
    if (nav.vibrate(durationMs)) return;
  }

  iosSwitchTick();
}
