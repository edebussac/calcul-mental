"use client";

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
              onClick={onReset}
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
              onClick={onDelete}
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
            onClick={() => onDigit(key)}
            className="neu-pressable rounded-2xl py-5 text-3xl font-semibold text-text disabled:opacity-50"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
