"use client";

import { useCallback, useState, type MouseEvent, type PointerEvent } from "react";

type Key = number | "back" | "reset";

const LAYOUT: Key[][] = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
  ["reset", 0, "back"],
];

export interface KeypadProps {
  onDigit: (digit: number) => void;
  onDelete: () => void;
  onReset: () => void;
  disabled?: boolean;
}

export function Keypad({ onDigit, onDelete, onReset, disabled }: KeypadProps) {
  /**
   * Touches actuellement enfoncées, par pointeur.
   *
   * L'état pressé ne peut PAS venir de `:active` : le CSS ne considère qu'un
   * seul élément actif à la fois, donc en multi-touch la seconde touche restait
   * visuellement au repos alors qu'elle répondait. On suit donc un doigt par
   * entrée, ce qui permet d'en afficher plusieurs enfoncées simultanément.
   */
  const [pressedBy, setPressedBy] = useState<ReadonlyMap<number, Key>>(new Map());
  const pressedKeys = new Set(pressedBy.values());

  const release = useCallback((pointerId: number) => {
    setPressedBy((prev) => {
      if (!prev.has(pointerId)) return prev;
      const next = new Map(prev);
      next.delete(pointerId);
      return next;
    });
  }, []);

  /**
   * Une touche part AU CONTACT (`pointerdown`), pas au relâchement.
   *
   * C'est ce qui permet d'enchaîner vite et de poser un doigt sur une touche
   * pendant que l'autre est encore appuyée : chaque pointeur émet son propre
   * `pointerdown`, là où `click` exige un appui ET un relâchement sur le même
   * élément — d'où les chiffres perdus quand deux appuis se chevauchent.
   *
   * `click` reste branché pour le clavier (Entrée / Espace), qui n'émet aucun
   * `pointerdown`. `detail === 0` identifie ces clics-là : au doigt ou à la
   * souris il vaut au moins 1, ce qui évite de compter l'appui deux fois.
   */
  function pressProps(key: Key, action: () => void) {
    return {
      "data-pressed": pressedKeys.has(key) || undefined,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        // Capture le pointeur : sans ça, un doigt qui glisse hors de la touche
        // avant de se lever émet son `pointerup` ailleurs, et la touche reste
        // enfoncée à l'écran indéfiniment.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* environnement sans capture de pointeur (jsdom) : sans conséquence */
        }
        setPressedBy((prev) => new Map(prev).set(event.pointerId, key));
        action();
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => release(event.pointerId),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
        release(event.pointerId),
      onClick: (event: MouseEvent) => {
        if (!disabled && event.detail === 0) action();
      },
    };
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {LAYOUT.flat().map((key) => {
        if (key === "reset") {
          return (
            <button
              key="reset"
              type="button"
              aria-label="Tout effacer"
              disabled={disabled}
              {...pressProps("reset", onReset)}
              className="neu-pressable rounded-2xl py-5 text-xl font-semibold text-muted disabled:opacity-50"
            >
              C
            </button>
          );
        }
        if (key === "back") {
          return (
            <button
              key="back"
              type="button"
              aria-label="Effacer"
              disabled={disabled}
              {...pressProps("back", onDelete)}
              className="neu-pressable rounded-2xl py-5 text-2xl text-muted disabled:opacity-50"
            >
              ⌫
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            aria-label={`Chiffre ${key}`}
            disabled={disabled}
            {...pressProps(key, () => onDigit(key))}
            className="neu-pressable rounded-2xl py-5 text-3xl font-semibold text-text disabled:opacity-50"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
