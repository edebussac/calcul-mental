import * as Haptics from "expo-haptics";

/**
 * Écart entre les deux secousses d'une bonne réponse.
 *
 * Deux valeurs déjà essayées et écartées : 500 ms séparait bien les deux
 * à-coups mais la seconde impulsion tombait souvent en pleine question
 * suivante ; 80 ms les fondait en un seul buzz plus long, indiscernable d'une
 * secousse unique — en dessous d'environ 100 ms, le Taptic Engine ne laisse
 * plus le temps à deux impacts `Heavy` de se distinguer.
 *
 * 150 ms est le repère habituel pour un double-tap qui reste perçu comme UN
 * geste à deux temps (au-delà de ~200 ms, il se lit plutôt comme deux taps
 * séparés — ce que ferait par exemple 250 ms).
 */
const SECOND_PULSE_MS = 150;

/**
 * Double secousse à chaque bonne réponse.
 *
 * Remplace le hack `<input switch>` du banc d'essai web : ici c'est le vrai
 * Taptic Engine, en intensité `Heavy` pour être senti pouce sur l'écran.
 *
 * Une seule secousse se confondait avec le simple retour d'appui d'une touche,
 * d'où le doublé.
 *
 * Les appels sont « tirés et oubliés » : une vibration qui échoue ne doit
 * jamais interrompre la partie.
 */
export function haptic(): void {
  const pulse = () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
      /* appareil sans moteur haptique, ou retour désactivé par l'utilisateur */
    });

  pulse();
  setTimeout(pulse, SECOND_PULSE_MS);
}
