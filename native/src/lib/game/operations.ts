/** Catalogue des opérations disponibles dans le menu d'entraînement. */

export const OPERATIONS = [
  "multiplication",
  "addition",
  "subtraction",
  "division",
  "all",
] as const;

export type Operation = (typeof OPERATIONS)[number];

/** Opérations « de base » (hors `all`, qui pioche parmi celles-ci). */
export const BASE_OPERATIONS = [
  "multiplication",
  "addition",
  "subtraction",
  "division",
] as const;

export type BaseOperation = (typeof BASE_OPERATIONS)[number];

export interface OperationConfig {
  id: Operation;
  /** Libellé affiché (FR). */
  label: string;
  /** Symbole mathématique affiché entre les opérandes. */
  symbol: string;
  /** Activée dans l'UI ? */
  enabled: boolean;
}

export const OPERATION_CONFIG: Record<Operation, OperationConfig> = {
  all: { id: "all", label: "Aléatoire", symbol: "?", enabled: true },
  division: { id: "division", label: "Division", symbol: "÷", enabled: true },
  multiplication: {
    id: "multiplication",
    label: "Multiplication",
    symbol: "×",
    enabled: true,
  },
  subtraction: {
    id: "subtraction",
    label: "Soustraction",
    symbol: "−",
    enabled: true,
  },
  addition: { id: "addition", label: "Addition", symbol: "+", enabled: true },
};

/** Ordre d'affichage dans le menu (identique aux captures). */
export const OPERATION_MENU_ORDER: Operation[] = [
  "all",
  "division",
  "multiplication",
  "subtraction",
  "addition",
];

export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
}

export function isBaseOperation(value: string): value is BaseOperation {
  return (BASE_OPERATIONS as readonly string[]).includes(value);
}
