"use client";

import type { MouseEvent } from "react";

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
  function pressProps(action: () => void) {
    return {
      onPointerDown: () => {
        if (!disabled) action();
      },
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
              {...pressProps(onReset)}
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
              {...pressProps(onDelete)}
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
            {...pressProps(() => onDigit(key))}
            className="neu-pressable rounded-2xl py-5 text-3xl font-semibold text-text disabled:opacity-50"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
