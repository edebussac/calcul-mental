import * as Haptics from "expo-haptics";

/** Écart entre les deux secousses d'une bonne réponse. */
const SECOND_PULSE_MS = 500;

/**
 * Double secousse à chaque bonne réponse.
 *
 * Remplace le hack `<input switch>` du banc d'essai web : ici c'est le vrai
 * Taptic Engine, en intensité `Heavy` pour être senti pouce sur l'écran.
 *
 * Deux impulsions espacées de 500 ms, et non une seule : la réponse suivante
 * arrive souvent avant la fin de l'écho visuel, et une secousse unique se
 * confondait avec le simple retour d'appui d'une touche.
 *
 * ⚠️ Conséquence assumée : en enchaînant vite, la seconde impulsion d'une
 * réponse peut tomber pendant la question suivante. C'est le prix d'un signal
 * espacé de 500 ms dans un jeu qui vise plusieurs réponses par minute.
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
