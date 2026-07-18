"use client";

type Key = number | "back" | null;

const LAYOUT: Key[][] = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
  ["back", 0, null],
];

export interface KeypadProps {
  onDigit: (digit: number) => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function Keypad({ onDigit, onDelete, disabled }: KeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {LAYOUT.flat().map((key, i) => {
        if (key === null) {
          return <div key={`spacer-${i}`} aria-hidden />;
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
