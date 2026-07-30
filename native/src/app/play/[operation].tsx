import { Redirect, useLocalSearchParams } from "expo-router";

import { Game } from "@/components/Game";
import { isOperation } from "@/lib/game/operations";

/**
 * Route de jeu. Ne fait que valider les paramètres d'URL avant de passer la
 * main à `Game` : une opération inconnue (lien tapé à la main, deep link
 * périmé) renvoie à l'accueil plutôt que de planter.
 */
export default function PlayScreen() {
  const { operation, mode } = useLocalSearchParams<{
    operation: string;
    mode?: string;
  }>();

  if (!isOperation(operation)) return <Redirect href="/" />;

  // Le ciblage adaptatif n'existe que pour la multiplication : il s'appuie sur
  // `multiplicationFactStats`, sans équivalent pour les autres opérations.
  const adaptive = mode === "adaptive" && operation === "multiplication";

  return <Game operation={operation} adaptive={adaptive} />;
}
