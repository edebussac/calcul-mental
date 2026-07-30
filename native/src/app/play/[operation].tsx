import { Redirect, useLocalSearchParams } from "expo-router";

import { Game } from "@/components/Game";
import { DEFAULT_LEVEL, isLevel } from "@/lib/game/levels";
import { isOperation } from "@/lib/game/operations";

/**
 * Route de jeu. Ne fait que valider les paramètres d'URL avant de passer la
 * main à `Game` : une opération inconnue (lien tapé à la main, deep link
 * périmé) renvoie à l'accueil plutôt que de planter.
 */
export default function PlayScreen() {
  const { operation, mode, level } = useLocalSearchParams<{
    operation: string;
    mode?: string;
    level?: string;
  }>();

  if (!isOperation(operation)) return <Redirect href="/" />;

  // Le ciblage adaptatif n'existe que pour la multiplication : il s'appuie sur
  // `multiplicationFactStats`, sans équivalent pour les autres opérations.
  const adaptive = mode === "adaptive" && operation === "multiplication";

  // Un niveau absent ou farfelu retombe sur `Facile` — jamais d'erreur pour un
  // paramètre d'URL, qui n'est pas sous le contrôle de l'app.
  const parsedLevel = isLevel(level) ? (Number(level) as 1 | 2 | 3 | 4) : DEFAULT_LEVEL;

  return <Game operation={operation} adaptive={adaptive} level={parsedLevel} />;
}
